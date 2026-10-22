'use strict';

/* ==========================================================================
   Social: core, feed, posts, notifications, badges
   Needs the account (window.fatboyCloud.community). A plain browser shows a
   short note instead. Names and avatars are the only identity people see.
   ========================================================================== */
const FORUM_CATEGORIES = ['wins', 'questions', 'recipes', 'tips', 'chat'];
const FORUM_FILTERS = ['all', 'following', ...FORUM_CATEGORIES];
const FORUM_REASONS = ['spam', 'abuse', 'unsafe', 'other'];
const FORUM_VIEWS = ['feed', 'friends', 'groups', 'ranks'];
const REACTIONS = [['like', '❤️'], ['strong', '💪'], ['fire', '🔥'], ['clap', '👏']];
const AVATAR_COLORS = ['blue', 'yellow', 'green', 'purple', 'pink', 'orange'];
const LEAGUES = ['bronze', 'silver', 'gold', 'sapphire', 'diamond'];
const LEAGUE_ICONS = { bronze: '🥉', silver: '🥈', gold: '🥇', sapphire: '🔷', diamond: '💎' };

const forum = {
  profile: undefined,   // undefined = not loaded, null = no username yet
  view: 'feed',
  category: 'all',
  query: '',
  searching: false,
  posts: [],
  loading: false,
  failed: false,
  more: false,
  page: null,           // { kind: post | profile | chat | group | challenge, id }
  stack: [],
  comments: [],
  commentsLoading: false,
  draft: { username: '', comment: '', message: '', search: '', code: '', groupName: '', groupDesc: '', groupQuery: '', challengeTitle: '', bio: '', people: '' },
  agree: false,
  compose: { category: 'chat', poll: false, options: ['', ''], image: null, preview: '', group: null },
  unread: { notifications: 0, messages: 0 },
  tip: null,
  blocked: [],
  busy: false,
  token: 0,
  d: {},                // loaded lists for the other tabs
};

const communityApi = () => cloudApi()?.community || null;
const socialReady = () => Boolean(communityApi() && account.user && forum.profile);

function forumReset() {
  Object.assign(forum, { profile: undefined, posts: [], loading: false, failed: false, more: false, page: null, stack: [], comments: [], blocked: [], busy: false, d: {}, tip: null, unread: { notifications: 0, messages: 0 } });
  forum.token += 1;
  paintBadge();
}

function forumAgo(at) {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (minutes < 1) return t('forum.now');
  if (minutes < 60) return t('forum.min', { n: minutes });
  if (minutes < 1440) return t('forum.hour', { n: Math.round(minutes / 60) });
  if (minutes < 10080) return t('forum.day', { n: Math.round(minutes / 1440) });
  return new Date(at).toLocaleDateString(state.settings.language, { month: 'short', day: 'numeric' });
}

function forumError(error) {
  const keys = { rate_limited: 'forum.slowDown', content_blocked: 'forum.errBlocked', not_a_member: 'forum.errMember', forbidden: 'forum.errForbidden', not_found: 'forum.notFound', age_required: 'forum.errAge' };
  toast(t(keys[error?.code] || 'forum.postFailed'));
}

// Runs an API call and shows a message if it fails. Returns the result, or undefined on failure.
async function forumTry(work) {
  try { return await work(); } catch (error) { forumError(error); return undefined; }
}

const mutedWords = () => (state.settings.muteWords || '').split(',').map(word => word.trim().toLowerCase()).filter(Boolean);
const isMuted = text => { const words = mutedWords(); const lower = String(text).toLowerCase(); return words.some(word => lower.includes(word)); };

/* --- Badges: earned on the phone (see quests.js), the best one shows next to the name ------------------- */
const BADGE_ORDER = ['halfway', 'graduate', 'streak30', 'unit1', 'fullboard', 'hattrick', 'kg1', 'streak7', 'chef', 'logger', 'streak3', 'perfect', 'hydration', 'weighin', 'first'];
const badgeIcon = id => icon(badgeById(id)?.icon || 'sparkle');
const badgeTitle = id => t(`badge.${id}.title`);
const earnedBadges = () => (state.profile ? BADGE_ORDER.filter(id => { const badge = badgeById(id); return badge && badgeEarned(badge); }) : []);

/* --- Sharing your numbers with the account (for boards and badges) ---------------------------------- */
let statsTimer = 0;
let statsSent = '';
function queueStats() {
  if (!socialReady()) return;
  clearTimeout(statsTimer);
  statsTimer = setTimeout(pushStats, 6000);
}
async function pushStats() {
  statsTimer = 0;
  const api = communityApi();
  if (!api || !socialReady() || !state.profile) return;
  const day = today();
  const stats = {
    xp: state.xp || 0, streak: currentStreak(), badges: earnedBadges(), day,
    dayXp: state.days[day] || 0, dayLessons: state.lessonsByDay[day] || 0,
    dayLogs: (state.food[day] || []).length + (state.moves[day] || []).length + (state.water[day] ? 1 : 0),
  };
  const signature = JSON.stringify(stats);
  if (signature === statsSent) return;
  try { await api.syncStats(stats); statsSent = signature; } catch (error) { /* next change retries */ }
}

/* --- Loading ---------------------------------------------------------------------- */
async function forumLoad({ append = false } = {}) {
  const api = communityApi();
  if (!api || !account.user) return;
  const token = forum.token;
  forum.loading = true;
  forum.failed = false;
  if (!append) paint();
  try {
    if (forum.profile === undefined) forum.profile = await api.profile();
    if (forum.profile) {
      const before = append && forum.posts.length ? forum.posts[forum.posts.length - 1].at : undefined;
      const rows = await api.feed({
        category: FORUM_CATEGORIES.includes(forum.category) ? forum.category : null,
        following: forum.category === 'following', query: forum.query || undefined, before,
      });
      if (token !== forum.token) return;
      forum.posts = append ? [...forum.posts, ...rows] : rows;
      forum.more = rows.length >= 20;
      if (!append && !forum.tip && forum.category === 'all' && !forum.query) api.tip().then(tip => { forum.tip = tip || false; if (!forum.page) paint(); }).catch(() => {});
      pushStats();
      pollSocial();
    }
  } catch (error) {
    if (token !== forum.token) return;
    forum.failed = true;
  }
  forum.loading = false;
  paint();
}

async function forumOpenPost(id) {
  forumGo('post', id);
}

async function loadPost(id) {
  const api = communityApi();
  forum.comments = [];
  forum.commentsLoading = true;
  forum.draft.comment = '';
  try {
    const [post, comments] = await Promise.all([api.post(id), api.comments(id)]);
    if (forum.page?.id !== id) return;
    if (!post) forum.page = null;
    else { const known = findPost(id); if (known) Object.assign(known, post); else forum.d.opened = post; }
    forum.comments = comments;
  } catch (error) {
    forum.failed = true;
  }
  forum.commentsLoading = false;
  paint();
}

function forumEnter() {
  if (account.user && communityApi() && forum.profile === undefined) forumLoad();
  else if (socialReady()) { pollSocial(); loadView(); }
}

/* --- Notifications and the unread badge ---------------------------------------------------------------- */
function paintBadge() {
  const total = forum.unread.notifications + forum.unread.messages;
  const tab = $('.tab[data-tab="forum"]');
  if (!tab) return;
  if (total) tab.setAttribute('data-badge', total > 9 ? '9+' : String(total));
  else tab.removeAttribute('data-badge');
}

let pollBusy = false;
async function pollSocial() {
  const api = communityApi();
  if (!api || !socialReady() || pollBusy || document.hidden) return;
  pollBusy = true;
  try {
    const next = await api.unread();
    const grew = next.notifications + next.messages > forum.unread.notifications + forum.unread.messages;
    forum.unread = next;
    paintBadge();
    if (grew && ui.tab !== 'forum') { buzz(12); toast(t('forum.newActivity')); }
    if (ui.tab === 'forum') {
      if (forum.page?.kind === 'chat') loadChat(forum.page.id, { quiet: true });
      else if (forum.view === 'friends' && !forum.page) loadFriends({ quiet: true });
      else if (grew && !forum.page && forum.view === 'feed') paint();
    }
  } catch (error) { /* try again later */ }
  pollBusy = false;
}
setInterval(pollSocial, 40000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { pollSocial(); flushQueue(); } });
window.addEventListener('online', flushQueue);

/* --- Offline queue: posts and comments wait until there is a connection -------------------------------- */
const QUEUE_KEY = 'fatboy.queue';
const readQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch (error) { return []; } };
const writeQueue = list => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-10))); } catch (error) { /* ignore */ } };
const isOffline = error => !navigator.onLine || error?.code === 'failed';
let flushing = false;
async function flushQueue() {
  const api = communityApi();
  if (!api || !socialReady() || flushing || !navigator.onLine) return;
  const list = readQueue();
  if (!list.length) return;
  flushing = true;
  const left = [];
  for (const item of list) {
    try {
      if (item.kind === 'post') await api.createPost(item.data);
      else await api.addComment(item.data.postId, item.data.body);
    } catch (error) {
      if (isOffline(error)) left.push(item);
    }
  }
  writeQueue(left);
  flushing = false;
  if (left.length < list.length) { toast(t('forum.sentQueued')); if (!forum.page && forum.view === 'feed') forumLoad(); }
}

/* --- Pieces ------------------------------------------------------------------------ */
const avatar = (who, big = false) => html`<span class="avatar${big ? ' is-big' : ''}" data-c="${who?.color || 'blue'}" aria-hidden="true">${(who?.username || '?').slice(0, 1).toUpperCase()}</span>`;
const nameLine = who => html`@${who.username}${who.topBadge ? html` <span class="badge-mark" role="img" aria-label="${badgeTitle(who.topBadge)}">${badgeIcon(who.topBadge)}</span>` : ''}`;
const commentCount = n => t(n === 1 ? 'forum.commentOne' : 'forum.commentMany', { n });

const personButton = (who, inner) => html`<button class="person" data-action="forum-profile" data-id="${who.userId}">${inner}</button>`;

const reactionBar = post => html`
  <div class="reactions" role="group" aria-label="${t('forum.react')}">
    ${REACTIONS.map(([kind, glyph]) => html`
      <button class="forum-act${post.myReaction === kind ? ' is-on' : ''}" data-action="forum-react" data-id="${post.id}" data-kind="${kind}" aria-pressed="${String(post.myReaction === kind)}" aria-label="${t(`react.${kind}`)}">
        <span aria-hidden="true">${glyph}</span><span class="num">${(post.reactions && post.reactions[kind]) || 0}</span>
      </button>`)}
  </div>`;

function pollView(post) {
  const poll = post.poll;
  if (!poll) return '';
  const counts = poll.counts || [];
  const total = counts.reduce((a, b) => a + b, 0);
  return html`
    <div class="poll" role="group" aria-label="${t('forum.poll')}">
      ${poll.options.map((option, i) => {
        const share = total ? Math.round((counts[i] / total) * 100) : 0;
        const mine = poll.mine === i;
        return html`<button class="poll-opt${mine ? ' is-on' : ''}" data-action="forum-vote" data-id="${post.id}" data-option="${i}" aria-pressed="${String(mine)}" style="--p:${poll.mine != null ? share : 0}%">
          <span class="poll-label">${option}</span>${poll.mine != null ? html`<span class="num">${share}%</span>` : ''}</button>`;
      })}
      <p class="caption">${t(total === 1 ? 'forum.voteOne' : 'forum.voteMany', { n: total })}</p>
    </div>`;
}

const postImage = post => (post.image && communityApi()?.imageUrl
  ? html`<img class="post-img" src="${communityApi().imageUrl(post.image)}" alt="${t('forum.imageAlt')}" loading="lazy">` : '');

const postHeader = post => html`
  <div class="post-head">
    ${personButton(post, avatar(post))}
    <div class="grow">
      <p class="post-name">${personButton(post, nameLine(post))}</p>
      <p class="caption">${forumAgo(post.at)} · ${t(`forum.cat.${post.category}`)}</p>
    </div>
    <button class="icon-btn" data-action="forum-menu" data-kind="post" data-id="${post.id}" aria-label="${t('forum.more')}">${icon('more')}</button>
  </div>`;

const postCard = post => html`
  <article class="card post">
    ${postHeader(post)}
    <button class="post-open" data-action="forum-open" data-id="${post.id}">
      <h3>${post.title}</h3>
      <p class="post-preview">${post.body}</p>
    </button>
    ${postImage(post)}
    ${post.poll ? html`<p class="caption">${icon('chat')} ${t('forum.poll')}</p>` : ''}
    <div class="post-foot">
      ${reactionBar(post)}
      <button class="forum-act" data-action="forum-open" data-id="${post.id}">${icon('chat')}<span class="num">${post.commentCount}</span><span class="sr-only">${commentCount(post.commentCount)}</span></button>
    </div>
  </article>`;

const forumNote = (title, body, extra = '') => html`
  <section class="card" aria-labelledby="forum-note">
    <h2 id="forum-note">${title}</h2>
    ${body ? html`<p class="measure">${body}</p>` : ''}
    ${extra}
  </section>`;

const usernameCard = () => html`
  <section class="card" aria-labelledby="pick-title">
    <h2 id="pick-title">${t('forum.pickTitle')}</h2>
    <p class="measure">${t('forum.pickBody')}</p>
    <div class="field">
      <label for="forum-username">${t('forum.usernameLabel')}</label>
      <input class="input" id="forum-username" data-forum="username" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="20" value="${forum.draft.username}" ${attributes({ 'aria-invalid': ui.errors.username ? 'true' : null, 'aria-describedby': ui.errors.username ? 'err-username' : null })}>
      ${errorLine('err-username', ui.errors.username)}
    </div>
    <button class="choice" data-action="forum-agree" role="checkbox" aria-checked="${String(forum.agree)}">
      <span class="check-box">${forum.agree ? icon('check') : ''}</span><span>${t('forum.age')}</span>
    </button>
    <button class="btn" data-action="forum-claim" ${attributes({ disabled: forum.busy })}>${t('forum.claim')}</button>
  </section>`;

/* --- Feed ------------------------------------------------------------------------- */
const welcomeCard = () => (state.flags.forumWelcome ? '' : html`
  <section class="card pinned" aria-labelledby="welcome-title">
    <div class="row"><h2 class="grow" id="welcome-title">📌 ${t('forum.welcomeTitle')}</h2>
      <button class="icon-btn" data-action="forum-hide-welcome" aria-label="${t('common.close')}">${icon('close')}</button></div>
    <p class="measure">${t('forum.welcomeBody')}</p>
  </section>`);

const forumTipCard = () => (forum.tip ? html`
  <section class="card tip-week" aria-label="${t('forum.tipTitle')}">
    <p class="caption">${t('forum.tipTitle')} · @${forum.tip.username}</p>
    <button class="post-open" data-action="forum-open" data-id="${forum.tip.id}"><h3>${forum.tip.title}</h3><p class="post-preview">${forum.tip.body}</p></button>
  </section>` : '');

function feedView() {
  const posts = forum.posts.filter(post => !isMuted(`${post.title} ${post.body}`));
  return html`
    <div class="row">
      <button class="btn grow" data-action="forum-compose">${icon('plus')}${t('forum.write')}</button>
      <button class="icon-btn" data-action="forum-search" aria-label="${t('forum.search')}" aria-expanded="${String(forum.searching)}">${icon('search')}</button>
    </div>
    ${forum.searching ? html`
      <div class="field">
        <label for="forum-search" class="sr-only">${t('forum.search')}</label>
        <input class="input" id="forum-search" data-forum="search" type="search" maxlength="40" placeholder="${t('forum.searchHint')}" value="${forum.draft.search}" autocomplete="off" enterkeyhint="search">
      </div>` : ''}
    <div class="chips" role="radiogroup" aria-label="${t('forum.filter')}">
      ${FORUM_FILTERS.map(key => html`<button class="chip" role="radio" data-action="forum-filter" data-value="${key}" aria-checked="${String(forum.category === key)}">${t(`forum.cat.${key}`)}</button>`)}
    </div>
    ${forum.category === 'all' && !forum.query ? welcomeCard() : ''}
    ${forum.category === 'all' && !forum.query ? forumTipCard() : ''}
    ${forum.failed
      ? forumNote(t('forum.failed'), '', html`<button class="btn btn-tonal" data-action="forum-retry">${t('forum.retry')}</button>`)
      : forum.loading && !forum.posts.length ? skeletonRows(3)
      : !posts.length ? emptyState(t(forum.category === 'following' ? 'forum.emptyFollowing' : forum.query ? 'forum.emptySearch' : 'forum.empty'))
      : html`<div class="stack">${posts.map(postCard)}</div>
             ${forum.more ? html`<button class="btn btn-tonal" data-action="forum-more">${t('forum.loadMore')}</button>` : ''}`}
    <p class="caption measure">${t('forum.guidelines')}</p>
    <button class="btn btn-plain" data-action="forum-blocked">${t('forum.blockedList')}</button>`;
}

function postPage() {
  const post = findPost(forum.page.id);
  const comments = forum.comments.filter(c => !isMuted(c.body));
  return post
    ? html`
      <article class="card post">
        ${postHeader(post)}
        <h2>${post.title}</h2>
        <p class="post-body">${post.body}</p>
        ${postImage(post)}
        ${pollView(post)}
        <div class="post-foot">${reactionBar(post)}</div>
        <p class="caption">${commentCount(post.commentCount)}</p>
      </article>
      <section class="stack" aria-label="${commentCount(comments.length)}">
        ${forum.commentsLoading ? skeletonRows(2)
          : comments.map(c => html`
            <div class="comment">
              ${personButton(c, avatar(c))}
              <div class="grow">
                <p class="post-name">${personButton(c, html`@${c.username}`)} <span class="caption">${forumAgo(c.at)}</span></p>
                <p class="post-body">${c.body}</p>
              </div>
              <button class="icon-btn" data-action="forum-menu" data-kind="comment" data-id="${c.id}" aria-label="${t('forum.more')}">${icon('more')}</button>
            </div>`)}
      </section>
      <div class="field">
        <label for="forum-comment">${t('forum.commentLabel')}</label>
        <textarea class="input" id="forum-comment" data-forum="comment" rows="3" maxlength="1000">${forum.draft.comment}</textarea>
        ${errorLine('err-comment', ui.errors.comment)}
      </div>
      <button class="btn" data-action="forum-comment" ${attributes({ disabled: forum.busy })}>${icon('send')}${t('forum.send')}</button>`
    : forumNote(t('forum.notFound'), '');
}

/* --- Screen ------------------------------------------------------------------------ */
const backButton = label => html`<button class="btn btn-plain back" data-action="forum-back">${icon('back')}${label || t('forum.back')}</button>`;

function forumHeader() {
  const total = forum.unread.notifications;
  return html`
    <div class="page-title social-head">
      <div class="grow"><h1>${t('forum.title')}</h1><p class="caption">@${forum.profile.username}</p></div>
      <button class="icon-btn" data-action="forum-bell" aria-label="${t('forum.bell')}${total ? `, ${total}` : ''}">${icon('bell')}${total ? html`<span class="dot-badge" aria-hidden="true">${total > 9 ? '9+' : total}</span>` : ''}</button>
      <button class="avatar-btn" data-action="forum-me" aria-label="${t('forum.myProfile')}">${avatar(forum.profile)}</button>
    </div>
    <div class="chips" role="tablist" aria-label="${t('forum.title')}">
      ${FORUM_VIEWS.map(key => html`<button class="chip" role="tab" data-action="forum-view" data-value="${key}" aria-selected="${String(forum.view === key)}">${t(`forum.view.${key}`)}${key === 'friends' && forum.unread.messages ? html`<span class="chip-dot" aria-label="${forum.unread.messages}"></span>` : ''}</button>`)}
    </div>`;
}

function forumScreen() {
  const empty = body => html`<div class="page-title"><h1>${t('forum.title')}</h1><p class="caption">${t('forum.subtitle')}</p></div>${body}`;
  if (!cloudApi() || !communityApi()) return empty(forumNote(t('forum.appOnlyTitle'), t('forum.appOnly')));
  if (!account.user) return empty(forumNote(t('forum.signInTitle'), t('forum.signInBody'), signInButton()));
  if (forum.profile === undefined) {
    return empty(forum.failed
      ? forumNote(t('forum.failed'), '', html`<button class="btn btn-tonal" data-action="forum-retry">${t('forum.retry')}</button>`)
      : skeletonRows(3));
  }
  if (!forum.profile) return empty(usernameCard());
  if (forum.page) {
    const pages = { post: postPage, profile: profilePage, chat: chatPage, group: groupPage, challenge: challengePage };
    return html`<div class="stack">${backButton()}${pages[forum.page.kind]()}</div>`;
  }
  const views = { feed: feedView, friends: friendsView, groups: groupsView, ranks: ranksView };
  return html`${forumHeader()}<div class="stack">${views[forum.view]()}</div>`;
}

/* --- Navigation -------------------------------------------------------------------- */
function forumGo(kind, id) {
  if (forum.page) forum.stack.push(forum.page);
  forum.page = { kind, id };
  paint({ entering: true });
  scrollTo(0, 0);
  loadPage();
}

function forumBack() {
  forum.page = forum.stack.pop() || null;
  paint({ entering: true });
  scrollTo(0, 0);
  if (forum.page) loadPage(); else loadView({ quiet: true });
}

function loadPage() {
  const { kind, id } = forum.page;
  if (kind === 'post') loadPost(id);
  else if (kind === 'profile') loadProfile(id);
  else if (kind === 'chat') loadChat(id);
  else if (kind === 'group') loadGroup(id);
  else if (kind === 'challenge') loadChallenge(id);
}

function loadView({ quiet = false } = {}) {
  if (forum.view === 'friends') loadFriends({ quiet });
  else if (forum.view === 'groups') loadGroups({ quiet });
  else if (forum.view === 'ranks') loadRanks({ quiet });
}

/* --- Sheets ------------------------------------------------------------------------ */
const composeSheet = () => {
  const c = forum.compose;
  return {
    label: t('forum.compose.title'),
    body: html`
      ${sheetHeader(c.group ? t('group.newPost') : t('forum.compose.title'))}
      <div class="field">
        <span class="field-label" id="topic-label">${t('forum.compose.category')}</span>
        <div class="chips" role="radiogroup" aria-labelledby="topic-label">
          ${FORUM_CATEGORIES.map(key => html`<button class="chip" role="radio" data-action="forum-topic" data-value="${key}" aria-checked="${String(c.category === key)}">${t(`forum.cat.${key}`)}</button>`)}
        </div>
      </div>
      <div class="field">
        <label for="post-title">${t('forum.compose.titleLabel')}</label>
        <input class="input" id="post-title" maxlength="80" autocomplete="off" value="${c.title || ''}">
      </div>
      <div class="field">
        <label for="post-body">${t('forum.compose.bodyLabel')}</label>
        <textarea class="input" id="post-body" rows="4" maxlength="2000">${c.body || ''}</textarea>
      </div>
      ${c.preview ? html`<div class="attach"><img class="post-img" src="${c.preview}" alt="${t('forum.imageAlt')}"><button class="btn btn-plain btn-danger btn-small" data-action="forum-image-clear">${t('forum.imageRemove')}</button></div>` : ''}
      ${c.poll ? html`<div class="stack-tight"><p class="field-label">${t('forum.pollOptions')}</p>${c.options.map((option, i) => html`
        <input class="input" data-poll="${i}" maxlength="40" placeholder="${t('forum.pollOption', { n: i + 1 })}" aria-label="${t('forum.pollOption', { n: i + 1 })}" value="${option}" autocomplete="off">`)}
        ${c.options.length < 4 ? html`<button class="btn btn-plain btn-small" data-action="forum-poll-add">${icon('plus')}${t('forum.pollAdd')}</button>` : ''}</div>` : ''}
      <div class="row row-wrap">
        <label class="btn btn-tonal btn-small" for="post-photo">${icon('camera')}${t('forum.addPhoto')}</label>
        <input class="sr-only" type="file" id="post-photo" accept="image/*" data-action-change="forum-image">
        <button class="btn btn-tonal btn-small" data-action="forum-poll-toggle" aria-pressed="${String(c.poll)}">${icon('chat')}${t('forum.poll')}</button>
      </div>
      <p class="caption measure">${t('forum.compose.rules')}</p>
      <p class="error" id="compose-error" role="alert" hidden></p>
      <button class="btn" data-action="forum-post">${t('forum.compose.post')}</button>`,
  };
};

function itemSheet(kind, id) {
  const item = kind === 'post' ? findPost(id) : forum.comments.find(c => c.id === id);
  if (!item) return null;
  const canMod = kind === 'post' && item.groupId && forum.d.group?.info?.id === item.groupId && ['owner', 'mod'].includes(forum.d.group.info.role);
  return {
    label: t('forum.more'),
    body: html`
      ${sheetHeader(t('forum.more'), `@${item.username}`)}
      ${item.mine
        ? html`<button class="btn btn-tonal btn-danger" data-action="forum-delete" data-kind="${kind}" data-id="${id}">${icon('trash')}${t('forum.delete')}</button>`
        : html`
          ${canMod ? html`<button class="btn btn-tonal btn-danger" data-action="forum-mod-remove" data-id="${id}">${icon('trash')}${t('group.modRemove')}</button>` : ''}
          <p class="field-label">${t('forum.reportWhy')}</p>
          <div class="stack">${FORUM_REASONS.map(reason => html`<button class="btn btn-tonal" data-action="forum-report" data-kind="${kind}" data-id="${id}" data-reason="${reason}">${icon('flag')}${t(`forum.reason.${reason}`)}</button>`)}</div>
          <button class="btn btn-plain btn-danger" data-action="forum-block" data-id="${item.userId}" data-name="${item.username}">${t('forum.block', { name: item.username })}</button>`}`,
  };
}

const blockedSheet = () => ({
  label: t('forum.blockedList'),
  body: html`
    ${sheetHeader(t('forum.blockedList'))}
    ${forum.blocked.length
      ? html`<div class="list">${forum.blocked.map(person => html`
          <div class="list-row"><span class="grow">@${person.username}</span>
          <button class="btn btn-tonal btn-small" data-action="forum-unblock" data-id="${person.userId}">${t('forum.unblock')}</button></div>`)}</div>`
      : html`<p>${t('forum.blockedNone')}</p>`}`,
});

function notificationText(n) {
  const who = `@${n.username || '…'}`;
  const map = {
    comment: t('note.comment', { who }), reaction: t('note.reaction', { who }), mention: t('note.mention', { who }), follow: t('note.follow', { who }),
    friend_request: t('note.friendRequest', { who }), friend_accept: t('note.friendAccept', { who }), duel: t('note.duel', { who }),
    duel_accept: t('note.duelAccept', { who }), buddy: t('note.buddy', { who }),
  };
  return map[n.kind] || t('note.other', { who });
}

const notificationsSheet = () => ({
  label: t('forum.bell'),
  body: html`
    ${sheetHeader(t('forum.bell'))}
    ${forum.d.notes == null ? skeletonRows(3)
      : forum.d.notes.length
        ? html`<div class="list">${forum.d.notes.map(n => html`
            <button class="list-row note-row${n.read ? '' : ' is-new'}" data-action="forum-note" data-kind="${n.kind}" data-post="${n.postId || ''}" data-actor="${n.actor || ''}">
              ${avatar(n)}<span class="grow"><span class="note-text">${notificationText(n)}</span>${n.text && ['comment', 'mention'].includes(n.kind) ? html`<span class="caption note-quote">${n.text}</span>` : ''}<span class="caption">${forumAgo(n.at)}</span></span>
            </button>`)}</div>`
        : html`<p>${t('forum.notesNone')}</p>`}`,
});

/* --- Actions ---------------------------------------------------------------------- */
const forumPrefill = (category, title = '') => {
  forum.compose = { category, title, body: '', poll: false, options: ['', ''], image: null, preview: '', group: forum.page?.kind === 'group' ? forum.page.id : null };
};

function readComposeFields() {
  const c = forum.compose;
  const title = $('#post-title'); const body = $('#post-body');
  if (title) c.title = title.value;
  if (body) c.body = body.value;
  $$('[data-poll]', roots.sheet).forEach(input => { c.options[Number(input.dataset.poll)] = input.value; });
}

async function shrinkImage(file, edge = 1080) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('image'))), 'image/jpeg', 0.82));
}

const communityActions = {
  'forum-retry': () => { forum.profile = forum.profile || undefined; forumLoad(); },
  'forum-view': el => { forum.view = el.dataset.value; forum.page = null; forum.stack = []; paint(); loadView(); },
  'forum-filter': el => { forum.category = el.dataset.value; forum.posts = []; forumLoad(); },
  'forum-search': () => { forum.searching = !forum.searching; if (!forum.searching && forum.query) { forum.query = ''; forum.draft.search = ''; forumLoad(); } else { paint(); $('#forum-search')?.focus(); } },
  'forum-more': () => forumLoad({ append: true }),
  'forum-open': el => forumGo('post', el.dataset.id),
  'forum-back': () => forumBack(),
  'forum-hide-welcome': () => { state.flags.forumWelcome = 1; saveState(); paint(); },
  'forum-agree': () => { forum.agree = !forum.agree; paint(); $('[data-action="forum-agree"]')?.focus({ preventScroll: true }); },
  'forum-compose': () => { forumPrefill(forum.category === 'all' || forum.category === 'following' ? 'chat' : forum.category); openSheet(composeSheet()); },
  'forum-topic': el => {
    forum.compose.category = el.dataset.value;
    $$('[data-action="forum-topic"]', roots.sheet).forEach(chip => chip.setAttribute('aria-checked', String(chip === el)));
  },
  'forum-poll-toggle': () => { readComposeFields(); forum.compose.poll = !forum.compose.poll; openSheet(composeSheet()); },
  'forum-poll-add': () => { readComposeFields(); forum.compose.options.push(''); openSheet(composeSheet()); },
  'forum-image-clear': () => { readComposeFields(); forum.compose.image = null; forum.compose.preview = ''; openSheet(composeSheet()); },
  'forum-claim': async () => {
    const name = forum.draft.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(name)) { ui.errors = { username: t('forum.errFormat') }; paint(); focusFirstInvalid(); return; }
    if (!forum.agree) { ui.errors = { username: t('forum.errAge') }; paint(); focusFirstInvalid(); return; }
    forum.busy = true; ui.errors = {}; paint();
    try {
      await communityApi().claim(name, true);
      forum.profile = await communityApi().profile();
      forum.draft.username = '';
      toast(t('forum.welcome', { name }));
      buzz(14);
      forumLoad();
      pushStats();
    } catch (error) {
      ui.errors = { username: error.code === 'username_taken' ? t('forum.errTaken') : error.code === 'content_blocked' ? t('forum.errBlocked') : error.code === 'invalid' ? t('forum.errFormat') : t('forum.postFailed') };
    }
    forum.busy = false;
    paint();
    if (ui.errors.username) focusFirstInvalid();
  },
  'forum-post': async el => {
    readComposeFields();
    const c = forum.compose;
    const title = (c.title || '').trim();
    const body = (c.body || '').trim();
    const options = c.poll ? c.options.map(option => option.trim()).filter(Boolean) : [];
    const problem = title.length < 3 ? t('forum.errTitle') : !body ? t('forum.errBody') : c.poll && options.length < 2 ? t('forum.errPoll') : '';
    const line = $('#compose-error');
    line.hidden = !problem;
    line.textContent = problem;
    if (problem) { (title.length < 3 ? $('#post-title') : $('#post-body')).focus(); return; }
    el.disabled = true;
    const data = { category: c.category, title, body, poll: c.poll ? { options } : null, group: c.group || null, image: null };
    try {
      if (c.image) data.image = await communityApi().uploadImage(c.image);
      await communityApi().createPost(data);
      closeSheet();
      toast(t('forum.posted'));
      buzz(14);
      sfx('success');
      if (c.group) loadGroup(c.group);
      else { forum.category = 'all'; forumLoad(); scrollTo(0, 0); }
    } catch (error) {
      if (isOffline(error) && !c.image) {
        writeQueue([...readQueue(), { kind: 'post', data }]);
        closeSheet();
        toast(t('forum.queued'));
        return;
      }
      el.disabled = false;
      line.hidden = false;
      line.textContent = t(error?.code === 'rate_limited' ? 'forum.slowDown' : error?.code === 'content_blocked' ? 'forum.errBlocked' : 'forum.postFailed');
    }
  },
  'forum-comment': async () => {
    const body = forum.draft.comment.trim();
    if (!body) { ui.errors = { comment: t('forum.errBody') }; paint(); focusFirstInvalid(); return; }
    const id = forum.page.id;
    forum.busy = true; ui.errors = {}; paint();
    try {
      await communityApi().addComment(id, body);
      forum.draft.comment = '';
      const [post, comments] = await Promise.all([communityApi().post(id), communityApi().comments(id)]);
      forum.comments = comments;
      if (post) Object.assign(findPost(post.id) || {}, post);
      buzz(10);
    } catch (error) {
      if (isOffline(error)) { writeQueue([...readQueue(), { kind: 'comment', data: { postId: id, body } }]); forum.draft.comment = ''; toast(t('forum.queued')); } else forumError(error);
    }
    forum.busy = false;
    paint();
  },
  'forum-react': async el => {
    const post = findPost(el.dataset.id);
    if (!post) return;
    const kind = el.dataset.kind;
    const previous = post.myReaction;
    post.reactions = { ...(post.reactions || {}) };
    if (previous) post.reactions[previous] = Math.max(0, (post.reactions[previous] || 1) - 1);
    post.myReaction = previous === kind ? null : kind;
    if (post.myReaction) post.reactions[kind] = (post.reactions[kind] || 0) + 1;
    buzz(8);
    sfx('tap');
    paint();
    try { await communityApi().react(post.id, post.myReaction); } catch (error) { forumError(error); loadPost(post.id); }
  },
  'forum-vote': async el => {
    const id = el.dataset.id;
    try { await communityApi().vote(id, Number(el.dataset.option)); buzz(8); const post = await communityApi().post(id); Object.assign(findPost(id) || {}, post); paint(); } catch (error) { forumError(error); }
  },
  'forum-menu': el => { const sheet = itemSheet(el.dataset.kind, el.dataset.id); if (sheet) openSheet(sheet); },
  'forum-delete': async el => {
    const done = await forumTry(() => communityApi().remove(el.dataset.kind, el.dataset.id).then(() => true));
    if (!done) return;
    closeSheet();
    if (el.dataset.kind === 'post') { dropPost(el.dataset.id); if (forum.page?.id === el.dataset.id) forumBack(); }
    else { forum.comments = forum.comments.filter(c => c.id !== el.dataset.id); const post = findPost(forum.page?.id); if (post) post.commentCount = Math.max(0, post.commentCount - 1); }
    toast(t('forum.deleted'));
    paint();
  },
  'forum-mod-remove': async el => {
    const done = await forumTry(() => communityApi().modRemove(el.dataset.id).then(() => true));
    if (!done) return;
    closeSheet();
    dropPost(el.dataset.id);
    toast(t('forum.deleted'));
    paint();
  },
  'forum-report': async el => {
    const done = await forumTry(() => communityApi().report(el.dataset.kind, el.dataset.id, el.dataset.reason).then(() => true));
    if (!done) return;
    closeSheet();
    if (el.dataset.kind === 'post') { dropPost(el.dataset.id); if (forum.page?.id === el.dataset.id) forumBack(); }
    else if (el.dataset.kind === 'comment') forum.comments = forum.comments.filter(c => c.id !== el.dataset.id);
    toast(t('forum.reported'));
    paint();
  },
  'forum-block': async el => {
    const done = await forumTry(() => communityApi().block(el.dataset.id, true).then(() => true));
    if (!done) return;
    closeSheet();
    forum.posts = forum.posts.filter(p => p.userId !== el.dataset.id);
    forum.comments = forum.comments.filter(c => c.userId !== el.dataset.id);
    if (forum.d.whoPosts) forum.d.whoPosts = forum.d.whoPosts.filter(p => p.userId !== el.dataset.id);
    toast(t('forum.blockedToast', { name: el.dataset.name }));
    if (forum.page && (forum.page.kind === 'profile' || forum.page.kind === 'chat' || (forum.page.kind === 'post' && !findPost(forum.page.id)))) forumBack(); else paint();
  },
  'forum-blocked': async () => {
    try { forum.blocked = await communityApi().blocked(); } catch (error) { forum.blocked = []; }
    openSheet(blockedSheet());
  },
  'forum-unblock': async el => {
    const done = await forumTry(() => communityApi().block(el.dataset.id, false).then(() => true));
    if (!done) return;
    forum.blocked = forum.blocked.filter(person => person.userId !== el.dataset.id);
    openSheet(blockedSheet());
    forumLoad();
  },
  'forum-bell': async () => {
    forum.d.notes = null;
    openSheet(notificationsSheet());
    try {
      forum.d.notes = await communityApi().notifications();
      openSheet(notificationsSheet());
      await communityApi().readNotifications();
      forum.unread.notifications = 0;
      paintBadge();
      if (!forum.page) paint();
    } catch (error) { forum.d.notes = []; openSheet(notificationsSheet()); }
  },
  'forum-note': el => {
    closeSheet();
    if (el.dataset.post) forumGo('post', el.dataset.post);
    else if (el.dataset.kind === 'friend_request' || el.dataset.kind === 'friend_accept' || el.dataset.kind === 'buddy') { forum.view = 'friends'; forum.page = null; forum.stack = []; paint(); loadView(); }
    else if (el.dataset.kind === 'duel' || el.dataset.kind === 'duel_accept') { forum.view = 'ranks'; forum.page = null; forum.stack = []; paint(); loadView(); }
    else if (el.dataset.actor) forumGo('profile', el.dataset.actor);
  },
  ...socialActions,
};

// File pickers and text fields report through change/input events.
document.addEventListener('change', async event => {
  const input = event.target;
  if (input.matches('[data-action-change="forum-image"]') && input.files && input.files[0]) {
    readComposeFields();
    try {
      forum.compose.image = await shrinkImage(input.files[0]);
      forum.compose.preview = URL.createObjectURL(forum.compose.image);
    } catch (error) { toast(t('forum.imageFailed')); }
    openSheet(composeSheet());
  }
});

let searchTimer = 0;
document.addEventListener('input', event => {
  if (event.target.id === 'forum-search') {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => { forum.query = event.target.value.trim(); forum.posts = []; await forumLoad(); const box = $('#forum-search'); if (box) { box.focus({ preventScroll: true }); box.setSelectionRange(box.value.length, box.value.length); } }, 450);
  }
});
