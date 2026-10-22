'use strict';

/* ==========================================================================
   Social: profiles, friends and messages, groups and challenges, ranks and duels
   ========================================================================== */
const METRICS = ['xp', 'lessons', 'logs'];
const DUEL_DAYS = [3, 5, 7];
const DUEL_GEMS = 25;
const SCOPES = ['friends', 'league', 'global'];

async function shareText(text) {
  try {
    if (window.fatboyShare?.text) await window.fatboyShare.text(text);
    else if (navigator.share) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); toast(t('common.copied')); }
  } catch (error) { /* the person closed the share sheet */ }
}

const findPost = id => {
  for (const list of [forum.posts, forum.d.whoPosts || [], forum.d.group?.posts || []]) {
    const hit = list.find(post => post.id === id);
    if (hit) return hit;
  }
  return forum.d.opened && forum.d.opened.id === id ? forum.d.opened : null;
};
const dropPost = id => {
  forum.posts = forum.posts.filter(post => post.id !== id);
  if (forum.d.whoPosts) forum.d.whoPosts = forum.d.whoPosts.filter(post => post.id !== id);
  if (forum.d.group) forum.d.group.posts = forum.d.group.posts.filter(post => post.id !== id);
};

const leagueName = key => `${LEAGUE_ICONS[key] || ''} ${t(`league.${key}`)}`;
const metricLabel = key => t(`metric.${key}`);

/* --- Profile page ---------------------------------------------------------------------- */
async function loadProfile(id) {
  forum.d.who = null; forum.d.whoPosts = [];
  try {
    const [who, posts] = await Promise.all([communityApi().publicProfile(id), communityApi().feed({ author: id })]);
    if (forum.page?.id !== id) return;
    forum.d.who = who || false;
    forum.d.whoPosts = posts;
  } catch (error) { forum.d.who = false; }
  paint();
}

function profileActions(p) {
  if (p.friendState === 'self') return html`<button class="btn btn-tonal" data-action="forum-edit-profile">${t('profile.edit')}</button>`;
  const friend = {
    friends: html`<button class="btn" data-action="forum-chat" data-id="${p.userId}">${icon('chat')}${t('friends.message')}</button>
                  <button class="btn btn-tonal" data-action="forum-duel-sheet" data-id="${p.userId}">${icon('bolt')}${t('duel.start')}</button>`,
    none: html`<button class="btn" data-action="forum-friend-add" data-id="${p.userId}">${icon('plus')}${t('friends.add')}</button>`,
    sent: html`<button class="btn btn-tonal" data-action="forum-friend-cancel" data-id="${p.userId}">${t('friends.sent')}</button>`,
    received: html`<button class="btn" data-action="forum-friend-accept" data-id="${p.userId}">${t('friends.accept')}</button>`,
  }[p.friendState] || '';
  return html`${friend}
    <button class="btn btn-tonal" data-action="forum-follow" data-id="${p.userId}" aria-pressed="${String(p.iFollow)}">${t(p.iFollow ? 'profile.following' : 'profile.follow')}</button>`;
}

function profilePage() {
  const p = forum.d.who;
  if (p === false) return forumNote(t('forum.notFound'), '');
  if (!p || p.userId !== forum.page.id) return skeletonRows(3);
  const posts = (forum.d.whoPosts || []).filter(post => !isMuted(`${post.title} ${post.body}`));
  return html`
    <section class="card profile-card" aria-label="@${p.username}">
      <div class="profile-top">
        ${avatar(p, true)}
        <div class="grow">
          <h2>${nameLine({ ...p, topBadge: (p.badges || [])[0] })}</h2>
          ${p.visible && p.league ? html`<p class="caption">${leagueName(p.league)}</p>` : ''}
          <p class="caption">${t('profile.joined', { date: new Date(p.joined).toLocaleDateString(state.settings.language, { month: 'short', year: 'numeric' }) })}</p>
        </div>
        ${p.friendState !== 'self' ? html`<button class="icon-btn" data-action="forum-user-menu" data-id="${p.userId}" data-name="${p.username}" aria-label="${t('forum.more')}">${icon('more')}</button>` : ''}
      </div>
      ${p.bio ? html`<p class="measure post-body">${p.bio}</p>` : ''}
      <div class="count-row">
        <div><strong class="num">${p.followers}</strong><span class="caption">${t('profile.followers')}</span></div>
        <div><strong class="num">${p.following}</strong><span class="caption">${t('profile.followingCount')}</span></div>
        <div><strong class="num">${p.posts}</strong><span class="caption">${t('profile.posts')}</span></div>
      </div>
      ${p.visible && p.streak != null ? html`
        <div class="count-row">
          <div><strong class="num">🔥 ${p.streak}</strong><span class="caption">${t('profile.streak')}</span></div>
          <div><strong class="num">${formatInt(p.xp)}</strong><span class="caption">XP</span></div>
        </div>` : ''}
      ${p.visible && (p.badges || []).length ? html`
        <ul class="badge-row" aria-label="${t('profile.badges')}">${p.badges.map(id => html`<li class="badge-chip"><span aria-hidden="true">${badgeIcon(id)}</span>${badgeTitle(id)}</li>`)}</ul>` : ''}
      ${!p.visible ? html`<p class="note">${icon('lock')} ${t('profile.private')}</p>` : ''}
      <div class="stack">${profileActions(p)}</div>
    </section>
    ${p.visible ? (posts.length ? html`<h2>${t('profile.posts')}</h2><div class="stack">${posts.map(postCard)}</div>` : '') : ''}`;
}

const AVATAR_SWATCH = { blue: '#0A84FF', yellow: '#FFD60A', green: '#30D158', purple: '#BF5AF2', pink: '#FF375F', orange: '#FF9F0A' };

const editProfileSheet = () => {
  const e = forum.d.edit;
  return {
    label: t('profile.edit'),
    body: html`
      ${sheetHeader(t('profile.edit'))}
      <div class="avatar-preview">${avatar(e, true)}</div>
      <div class="field">
        <span class="field-label" id="avc-label">${t('profile.color')}</span>
        <div class="chips" role="radiogroup" aria-labelledby="avc-label">${AVATAR_COLORS.map(key => html`
          <button class="swatch-dot${e.color === key ? ' is-on' : ''}" data-c="${key}" role="radio" aria-checked="${String(e.color === key)}" aria-label="${t(`color.${key}`)}" data-action="forum-edit-color" data-value="${key}"></button>`)}</div>
      </div>
      <div class="field">
        <label for="edit-bio">${t('profile.bio')}</label>
        <textarea class="input" id="edit-bio" rows="2" maxlength="140" data-forum="bio">${e.bio}</textarea>
      </div>
      <button class="choice" role="checkbox" aria-checked="${String(e.private)}" data-action="forum-edit-private">
        <span class="check-box">${e.private ? icon('check') : ''}</span><span>${t('profile.makePrivate')}<span class="caption block">${t('profile.privateHelp')}</span></span>
      </button>
      <button class="choice" role="checkbox" aria-checked="${String(e.showStats)}" data-action="forum-edit-stats">
        <span class="check-box">${e.showStats ? icon('check') : ''}</span><span>${t('profile.showStats')}</span>
      </button>
      <p class="error" id="edit-error" role="alert" hidden></p>
      <button class="btn" data-action="forum-edit-save">${t('common.save')}</button>`,
  };
};

const userMenuSheet = (id, name) => ({
  label: t('forum.more'),
  body: html`
    ${sheetHeader(t('forum.more'), `@${name}`)}
    <p class="field-label">${t('forum.reportWhy')}</p>
    <div class="stack">${FORUM_REASONS.map(reason => html`<button class="btn btn-tonal" data-action="forum-report" data-kind="profile" data-id="${id}" data-reason="${reason}">${icon('flag')}${t(`forum.reason.${reason}`)}</button>`)}</div>
    ${forum.d.who?.friendState === 'friends' ? html`<button class="btn btn-tonal" data-action="forum-unfriend" data-id="${id}">${t('friends.remove')}</button>` : ''}
    <button class="btn btn-plain btn-danger" data-action="forum-block" data-id="${id}" data-name="${name}">${t('forum.block', { name })}</button>`,
});

const duelSheet = id => ({
  label: t('duel.start'),
  body: html`
    ${sheetHeader(t('duel.start'), t('duel.help'))}
    <div class="field">
      <span class="field-label" id="dm-label">${t('duel.metric')}</span>
      <div class="chips" role="radiogroup" aria-labelledby="dm-label">${METRICS.map(key => html`
        <button class="chip" role="radio" data-action="forum-duel-metric" data-value="${key}" aria-checked="${String(forum.d.duel.metric === key)}">${metricLabel(key)}</button>`)}</div>
    </div>
    <div class="field">
      <span class="field-label" id="dd-label">${t('duel.length')}</span>
      <div class="chips" role="radiogroup" aria-labelledby="dd-label">${DUEL_DAYS.map(days => html`
        <button class="chip" role="radio" data-action="forum-duel-days" data-value="${days}" aria-checked="${String(forum.d.duel.days === days)}">${t('duel.days', { n: days })}</button>`)}</div>
    </div>
    <button class="btn" data-action="forum-duel-send" data-id="${id}">${icon('bolt')}${t('duel.send')}</button>`,
});

/* --- Friends and messages ------------------------------------------------------------------ */
async function loadFriends({ quiet = false } = {}) {
  const api = communityApi();
  if (!quiet && !forum.d.friends) paint();
  try {
    const [friends, requests, waiting] = await Promise.all([api.friends(), api.requests(), api.buddyWaiting()]);
    forum.d.friends = friends; forum.d.requests = requests; forum.d.waiting = Boolean(waiting);
    forum.unread.messages = friends.reduce((sum, f) => sum + (f.unread || 0), 0);
    paintBadge();
  } catch (error) { forum.d.friends = forum.d.friends || []; forum.d.friendsFailed = true; }
  if (ui.tab === 'forum' && !forum.page && forum.view === 'friends' && !document.activeElement?.matches('input')) paint();
}

const friendRow = f => html`
  <button class="list-row friend-row" data-action="forum-chat" data-id="${f.userId}">
    ${avatar(f)}
    <span class="grow"><span class="post-name">@${f.username}${f.buddy ? html` <span class="tag">${t('friends.buddy')}</span>` : ''}</span>
      <span class="caption line-clamp">${f.lastBody || t('friends.noMessages')}</span></span>
    ${f.streak ? html`<span class="caption num" aria-label="${t('profile.streak')}">🔥 ${f.streak}</span>` : ''}
    ${f.unread ? html`<span class="dot-badge static" aria-label="${f.unread}">${f.unread}</span>` : ''}
  </button>`;

function friendsView() {
  const d = forum.d;
  const requests = d.requests || [];
  const code = forum.profile.inviteCode;
  return html`
    ${requests.length ? html`
      <section class="card" aria-labelledby="req-title">
        <h2 id="req-title">${t('friends.requests')}</h2>
        <div class="list">${requests.map(r => html`
          <div class="list-row">${personButton(r, avatar(r))}<span class="grow post-name">@${r.username}</span>
            ${r.incoming
              ? html`<button class="btn btn-small" data-action="forum-friend-accept" data-id="${r.userId}">${t('friends.accept')}</button>
                     <button class="btn btn-plain btn-small" data-action="forum-friend-decline" data-id="${r.userId}">${t('friends.decline')}</button>`
              : html`<button class="btn btn-tonal btn-small" data-action="forum-friend-cancel" data-id="${r.userId}">${t('friends.cancel')}</button>`}
          </div>`)}</div>
      </section>` : ''}
    <section class="stack-tight" aria-labelledby="friends-title">
      <h2 id="friends-title">${t('friends.title')}</h2>
      ${d.friends == null ? skeletonRows(2)
        : d.friends.length ? html`<div class="list">${d.friends.map(friendRow)}</div>` : emptyState(t('friends.empty'))}
    </section>
    <section class="card" aria-labelledby="find-title">
      <h2 id="find-title">${t('friends.find')}</h2>
      <div class="field">
        <label for="people-search">${t('friends.search')}</label>
        <input class="input" id="people-search" data-forum="people" type="search" maxlength="20" autocomplete="off" autocapitalize="none" placeholder="${t('friends.searchHint')}" value="${forum.draft.people}">
      </div>
      ${(d.people || []).length ? html`<div class="list">${d.people.map(p => html`
        <div class="list-row">${personButton(p, avatar(p))}<span class="grow post-name">@${p.username}</span>
          <button class="btn btn-tonal btn-small" data-action="forum-friend-add" data-id="${p.userId}">${t('friends.add')}</button></div>`)}</div>` : ''}
      <div class="rule"></div>
      <p class="caption measure">${t('friends.codeHelp')}</p>
      <div class="code-box"><span class="code num" aria-label="${t('friends.yourCode')}">${code}</span>
        <button class="btn btn-tonal btn-small" data-action="forum-share-code">${icon('send')}${t('friends.share')}</button></div>
      <div class="field">
        <label for="friend-code">${t('friends.haveCode')}</label>
        <div class="row"><input class="input grow" id="friend-code" data-forum="code" maxlength="12" autocomplete="off" autocapitalize="none" value="${forum.draft.code}">
          <button class="btn btn-tonal" data-action="forum-redeem">${t('friends.redeem')}</button></div>
      </div>
    </section>
    <section class="card" aria-labelledby="buddy-title">
      <h2 id="buddy-title">🤝 ${t('buddy.title')}</h2>
      <p class="measure">${t('buddy.help')}</p>
      ${d.waiting
        ? html`<p class="note" role="status">${t('buddy.waiting')}</p><button class="btn btn-tonal" data-action="forum-buddy-cancel">${t('buddy.cancel')}</button>`
        : html`<button class="btn" data-action="forum-buddy">${t('buddy.find')}</button>`}
    </section>`;
}

async function loadChat(id, { quiet = false } = {}) {
  try {
    const messages = await communityApi().conversation(id);
    if (forum.page?.id !== id || forum.page.kind !== 'chat') return;
    const grew = !forum.d.chat || forum.d.chat.id !== id || forum.d.chat.messages.length !== messages.length;
    forum.d.chat = { id, messages };
    if (!forum.d.friends) forum.d.friends = await communityApi().friends();
    if (grew || !quiet) { paint(); requestAnimationFrame(() => scrollTo(0, document.body.scrollHeight)); }
    forum.unread.messages = Math.max(0, forum.unread.messages - 1);
    paintBadge();
  } catch (error) { forum.d.chat = { id, messages: [], failed: true }; paint(); }
}

function chatPage() {
  const id = forum.page.id;
  const friend = (forum.d.friends || []).find(f => f.userId === id) || (forum.d.who?.userId === id ? forum.d.who : null);
  const chat = forum.d.chat?.id === id ? forum.d.chat : null;
  return html`
    <div class="row chat-head">
      ${friend ? personButton({ userId: id }, html`${avatar(friend)}<span class="post-name">@${friend.username}</span>`) : ''}
    </div>
    <div class="chat" aria-live="polite">
      ${!chat ? skeletonRows(3)
        : chat.failed ? forumNote(t('forum.failed'), '')
        : chat.messages.length ? chat.messages.map(m => html`<div class="bubble-msg${m.mine ? ' is-mine' : ''}"><p>${m.body}</p><span class="caption">${forumAgo(m.at)}</span></div>`)
        : emptyState(t('friends.noMessagesYet'))}
    </div>
    <div class="chat-input">
      <label for="chat-text" class="sr-only">${t('friends.messageLabel')}</label>
      <input class="input grow" id="chat-text" data-forum="message" maxlength="500" autocomplete="off" placeholder="${t('friends.messageLabel')}" value="${forum.draft.message}" enterkeyhint="send">
      <button class="btn" data-action="forum-send" aria-label="${t('forum.send')}" ${attributes({ disabled: forum.busy })}>${icon('send')}</button>
    </div>`;
}

/* --- Groups ------------------------------------------------------------------------------ */
async function loadGroups({ quiet = false } = {}) {
  if (!quiet && !forum.d.groups) paint();
  try {
    const [mine, discover] = await Promise.all([communityApi().groups(), communityApi().discoverGroups(forum.draft.groupQuery)]);
    forum.d.groups = mine; forum.d.discover = discover;
  } catch (error) { forum.d.groups = forum.d.groups || []; forum.d.discover = forum.d.discover || []; }
  if (ui.tab === 'forum' && !forum.page && forum.view === 'groups' && !document.activeElement?.matches('input')) paint();
}

const groupRow = (g, joined) => html`
  <div class="list-row group-row">
    <button class="group-open" data-action="forum-group" data-id="${g.id}"><span class="group-emoji" aria-hidden="true">${g.emoji}</span>
      <span class="grow"><span class="post-name">${g.name}</span><span class="caption line-clamp">${g.description || t('group.members', { n: g.memberCount })}</span></span></button>
    ${joined ? html`<span class="caption">${t('group.members', { n: g.memberCount })}</span>`
      : html`<button class="btn btn-tonal btn-small" data-action="forum-group-join" data-id="${g.id}">${t('group.join')}</button>`}
  </div>`;

function groupsView() {
  const d = forum.d;
  const mineIds = new Set((d.groups || []).map(g => g.id));
  return html`
    <button class="btn" data-action="forum-group-new">${icon('plus')}${t('group.create')}</button>
    <section class="stack-tight" aria-labelledby="mygroups-title">
      <h2 id="mygroups-title">${t('group.mine')}</h2>
      ${d.groups == null ? skeletonRows(2) : d.groups.length ? html`<div class="list">${d.groups.map(g => groupRow(g, true))}</div>` : emptyState(t('group.empty'))}
    </section>
    <section class="card" aria-labelledby="discover-title">
      <h2 id="discover-title">${t('group.discover')}</h2>
      <div class="field">
        <label for="group-search" class="sr-only">${t('group.search')}</label>
        <input class="input" id="group-search" data-forum="groupQuery" type="search" maxlength="30" placeholder="${t('group.search')}" value="${forum.draft.groupQuery}" autocomplete="off">
      </div>
      ${(d.discover || []).filter(g => !mineIds.has(g.id)).length
        ? html`<div class="list">${d.discover.filter(g => !mineIds.has(g.id)).map(g => groupRow(g, false))}</div>`
        : html`<p class="caption">${t('group.noneFound')}</p>`}
      <div class="rule"></div>
      <div class="field">
        <label for="group-code">${t('group.haveCode')}</label>
        <div class="row"><input class="input grow" id="group-code" data-forum="code" maxlength="12" autocomplete="off" autocapitalize="none" value="${forum.draft.code}">
          <button class="btn btn-tonal" data-action="forum-group-code">${t('group.joinCode')}</button></div>
      </div>
    </section>`;
}

const newGroupSheet = () => {
  const g = forum.d.newGroup;
  return {
    label: t('group.create'),
    body: html`
      ${sheetHeader(t('group.create'))}
      <div class="field"><span class="field-label" id="ge-label">${t('group.emoji')}</span>
        <div class="avatar-grid" role="radiogroup" aria-labelledby="ge-label">${['💪', '🥗', '🏃', '🧘', '🚴', '🍎', '🔥', '🌱'].map(glyph => html`
          <button class="avatar-pick${g.emoji === glyph ? ' is-on' : ''}" role="radio" aria-checked="${String(g.emoji === glyph)}" data-action="forum-group-emoji" data-value="${glyph}">${glyph}</button>`)}</div></div>
      <div class="field"><label for="group-name">${t('group.name')}</label><input class="input" id="group-name" maxlength="40" autocomplete="off" value="${g.name}"></div>
      <div class="field"><label for="group-desc">${t('group.description')}</label><textarea class="input" id="group-desc" rows="2" maxlength="200">${g.description}</textarea></div>
      <button class="choice" role="checkbox" aria-checked="${String(g.isPrivate)}" data-action="forum-group-private">
        <span class="check-box">${g.isPrivate ? icon('check') : ''}</span><span>${t('group.private')}<span class="caption block">${t('group.privateHelp')}</span></span>
      </button>
      <p class="error" id="group-error" role="alert" hidden></p>
      <button class="btn" data-action="forum-group-save">${t('group.createButton')}</button>`,
  };
};

async function loadGroup(id) {
  const api = communityApi();
  const known = forum.d.group && forum.d.group.info?.id === id ? forum.d.group : null;
  forum.d.group = known || { info: null, tab: 'feed', posts: [], members: [], challenges: [] };
  try {
    const [mine, discover] = await Promise.all([api.groups(), api.discoverGroups('')]);
    const info = [...mine, ...discover].find(g => g.id === id) || null;
    forum.d.group.info = info;
    if (info) {
      const [posts, members, challenges] = await Promise.all([
        api.feed({ group: id }), api.groupMembers(id), info.role ? api.challenges(id) : Promise.resolve([])]);
      Object.assign(forum.d.group, { posts, members, challenges });
    }
  } catch (error) { forum.d.group.failed = true; }
  if (forum.page?.id === id) paint();
}

function groupPage() {
  const g = forum.d.group;
  if (!g || !g.info) return g?.failed ? forumNote(t('forum.failed'), '') : (g && g.info === null && !g.posts.length && g.loaded) ? forumNote(t('forum.notFound'), '') : skeletonRows(3);
  const info = g.info;
  const member = Boolean(info.role);
  const mod = ['owner', 'mod'].includes(info.role);
  const posts = g.posts.filter(post => !isMuted(`${post.title} ${post.body}`));
  const tabs = ['feed', 'challenges', 'members'];
  return html`
    <section class="card profile-card">
      <div class="profile-top"><span class="group-emoji big" aria-hidden="true">${info.emoji}</span>
        <div class="grow"><h2>${info.name}</h2><p class="caption">${t('group.members', { n: info.memberCount })}${info.isPrivate ? ` · ${t('group.privateTag')}` : ''}</p></div></div>
      ${info.description ? html`<p class="measure post-body">${info.description}</p>` : ''}
      ${mod && info.code ? html`<div class="code-box"><span class="code num" aria-label="${t('group.code')}">${info.code}</span><button class="btn btn-tonal btn-small" data-action="forum-group-share" data-name="${info.name}" data-code="${info.code}">${icon('send')}${t('friends.share')}</button></div>` : ''}
      ${member
        ? html`<button class="btn btn-plain btn-danger" data-action="forum-group-leave" data-id="${info.id}">${t('group.leave')}</button>`
        : html`<button class="btn" data-action="forum-group-join" data-id="${info.id}">${t('group.join')}</button>`}
    </section>
    ${member ? html`
      <div class="chips" role="tablist">${tabs.map(key => html`<button class="chip" role="tab" data-action="forum-group-tab" data-value="${key}" aria-selected="${String(g.tab === key)}">${t(`group.tab.${key}`)}</button>`)}</div>
      ${g.tab === 'feed' ? html`
        <button class="btn" data-action="forum-compose">${icon('plus')}${t('group.newPost')}</button>
        ${posts.length ? html`<div class="stack">${posts.map(postCard)}</div>` : emptyState(t('group.emptyFeed'))}` : ''}
      ${g.tab === 'challenges' ? challengesView(g) : ''}
      ${g.tab === 'members' ? html`<div class="list">${g.members.map(m => html`
        <div class="list-row">${personButton(m, avatar(m))}<span class="grow post-name">@${m.username}${m.role !== 'member' ? html` <span class="tag">${t(`group.role.${m.role}`)}</span>` : ''}</span>
          ${info.role === 'owner' && m.role !== 'owner' ? html`<button class="btn btn-tonal btn-small" data-action="forum-group-role" data-user="${m.userId}" data-role="${m.role === 'mod' ? 'member' : 'mod'}">${t(m.role === 'mod' ? 'group.demote' : 'group.promote')}</button>` : ''}
          ${mod && m.role === 'member' ? html`<button class="btn btn-plain btn-danger btn-small" data-action="forum-group-kick" data-user="${m.userId}">${t('group.remove')}</button>` : ''}
        </div>`)}</div>` : ''}` : html`<p class="note">${icon('lock')} ${t('group.joinToSee')}</p>`}`;
}

function challengesView(g) {
  return html`
    <button class="btn" data-action="forum-challenge-new">${icon('bolt')}${t('challenge.create')}</button>
    ${g.challenges.length ? html`<div class="stack">${g.challenges.map(c => html`
      <article class="card">
        <div class="row"><h3 class="grow">${c.title}</h3><span class="tag">${metricLabel(c.metric)}</span></div>
        <p class="caption">${c.active ? t('challenge.ends', { date: new Date(c.ends).toLocaleDateString(state.settings.language, { month: 'short', day: 'numeric' }) }) : t('challenge.over')} · ${t('challenge.members', { n: c.members })}</p>
        ${c.leader ? html`<p>🥇 @${c.leader} · <span class="num">${c.leaderScore}</span></p>` : ''}
        <p class="caption">${t('challenge.yourScore')}: <span class="num">${c.mine}</span></p>
        <div class="row row-wrap">
          <button class="btn btn-tonal btn-small" data-action="forum-challenge-open" data-id="${c.id}">${t('challenge.board')}</button>
          ${c.active ? html`<button class="btn ${c.joined ? 'btn-plain' : ''} btn-small" data-action="forum-challenge-join" data-id="${c.id}" data-on="${c.joined ? '0' : '1'}">${t(c.joined ? 'challenge.leave' : 'challenge.join')}</button>` : ''}
        </div>
      </article>`)}</div>` : emptyState(t('challenge.empty'))}`;
}

const newChallengeSheet = () => {
  const c = forum.d.newChallenge;
  return {
    label: t('challenge.create'),
    body: html`
      ${sheetHeader(t('challenge.create'), t('challenge.help'))}
      <div class="field"><label for="challenge-title">${t('challenge.titleLabel')}</label><input class="input" id="challenge-title" maxlength="60" autocomplete="off" value="${c.title}"></div>
      <div class="field"><span class="field-label" id="cm-label">${t('duel.metric')}</span>
        <div class="chips" role="radiogroup" aria-labelledby="cm-label">${METRICS.map(key => html`<button class="chip" role="radio" data-action="forum-challenge-metric" data-value="${key}" aria-checked="${String(c.metric === key)}">${metricLabel(key)}</button>`)}</div></div>
      <div class="field"><span class="field-label" id="cd-label">${t('duel.length')}</span>
        <div class="chips" role="radiogroup" aria-labelledby="cd-label">${[3, 7, 14, 30].map(days => html`<button class="chip" role="radio" data-action="forum-challenge-days" data-value="${days}" aria-checked="${String(c.days === days)}">${t('duel.days', { n: days })}</button>`)}</div></div>
      <p class="error" id="challenge-error" role="alert" hidden></p>
      <button class="btn" data-action="forum-challenge-save">${t('challenge.createButton')}</button>`,
  };
};

async function loadChallenge(id) {
  forum.d.board = null;
  try { const board = await communityApi().challengeBoard(id); if (forum.page?.id === id) forum.d.board = board; } catch (error) { forum.d.board = []; }
  paint();
}

function challengePage() {
  const c = (forum.d.group?.challenges || []).find(x => x.id === forum.page.id);
  return html`
    ${c ? html`<section class="card"><h2>${c.title}</h2><p class="caption">${metricLabel(c.metric)} · ${c.active ? t('challenge.ends', { date: new Date(c.ends).toLocaleDateString(state.settings.language, { month: 'short', day: 'numeric' }) }) : t('challenge.over')}</p></section>` : ''}
    ${forum.d.board == null ? skeletonRows(3)
      : html`<div class="list">${forum.d.board.map(row => html`
          <div class="list-row rank-row${row.mine ? ' is-me' : ''}"><span class="rank num">${row.rank}</span>${avatar(row)}<span class="grow post-name">@${row.username}${row.mine ? ` (${t('ranks.you')})` : ''}</span><span class="num">${formatInt(row.score)}</span></div>`)}</div>`}`;
}

/* --- Ranks, leagues and duels ---------------------------------------------------------------- */
async function loadRanks({ quiet = false } = {}) {
  const api = communityApi();
  const d = forum.d;
  d.scope = d.scope || 'friends'; d.metric = d.metric || 'xp';
  if (!quiet) { d.board2 = null; paint(); }
  try {
    const [board, duels] = await Promise.all([api.leaderboard(d.scope, d.metric), api.duels()]);
    d.board2 = board; d.duels = duels;
    d.league = (board.find(row => row.mine) || {}).league || d.league;
  } catch (error) { d.board2 = []; d.duels = d.duels || []; }
  if (ui.tab === 'forum' && !forum.page && forum.view === 'ranks') paint();
}

function duelCard(duel) {
  const total = Math.max(1, duel.mine + duel.theirs);
  const left = duel.ends ? Math.max(0, Math.round((new Date(duel.ends) - new Date(today())) / 864e5)) : duel.days;
  if (duel.status === 'pending') {
    return html`
      <article class="card duel">
        <p><strong>@${duel.username}</strong> · ${metricLabel(duel.metric)} · ${t('duel.days', { n: duel.days })}</p>
        ${duel.incoming
          ? html`<div class="row"><button class="btn btn-small" data-action="forum-duel-accept" data-id="${duel.id}">${t('friends.accept')}</button><button class="btn btn-plain btn-small" data-action="forum-duel-decline" data-id="${duel.id}">${t('friends.decline')}</button></div>`
          : html`<p class="caption">${t('duel.waiting')}</p>`}
      </article>`;
  }
  const paid = state.flags.duelPaid && state.flags.duelPaid[duel.id];
  return html`
    <article class="card duel">
      <div class="row"><p class="grow"><strong>${t('ranks.you')}</strong> vs <strong>@${duel.username}</strong></p><span class="tag">${metricLabel(duel.metric)}</span></div>
      <div class="duel-bar" role="img" aria-label="${duel.mine} / ${duel.theirs}"><i style="width:${Math.round((duel.mine / total) * 100)}%"></i></div>
      <div class="row"><span class="num">${duel.mine}</span><span class="grow caption center">${duel.finished ? (duel.won ? t('duel.won') : duel.mine === duel.theirs ? t('duel.tie') : t('duel.lost')) : t('duel.left', { n: left })}</span><span class="num">${duel.theirs}</span></div>
      ${duel.finished && duel.won && !paid ? html`<button class="btn btn-small" data-action="forum-duel-claim" data-id="${duel.id}">${icon('gem')}${t('duel.claim', { n: DUEL_GEMS })}</button>` : ''}
    </article>`;
}

function ranksView() {
  const d = forum.d;
  const scope = d.scope || 'friends';
  const metric = d.metric || 'xp';
  return html`
    ${d.league ? html`<section class="card league-card"><span class="league-icon" aria-hidden="true">${LEAGUE_ICONS[d.league]}</span><div><h2>${t('ranks.yourLeague', { name: t(`league.${d.league}`) })}</h2><p class="caption">${t('ranks.leagueHelp')}</p></div></section>` : ''}
    <div class="chips" role="radiogroup" aria-label="${t('ranks.scope')}">${SCOPES.map(key => html`<button class="chip" role="radio" data-action="forum-scope" data-value="${key}" aria-checked="${String(scope === key)}">${t(`ranks.${key}`)}</button>`)}</div>
    <div class="chips" role="radiogroup" aria-label="${t('duel.metric')}">${METRICS.map(key => html`<button class="chip" role="radio" data-action="forum-metric" data-value="${key}" aria-checked="${String(metric === key)}">${metricLabel(key)}</button>`)}</div>
    <p class="caption">${t('ranks.week')}</p>
    ${d.board2 == null ? skeletonRows(4)
      : d.board2.length ? html`<div class="list">${d.board2.map(row => html`
          <button class="list-row rank-row${row.mine ? ' is-me' : ''}" data-action="forum-profile" data-id="${row.userId}"><span class="rank num">${row.rank}</span>${avatar(row)}
            <span class="grow post-name">@${row.username}${row.mine ? ` (${t('ranks.you')})` : ''}</span><span class="num">${formatInt(row.score)}</span></button>`)}</div>`
        : emptyState(t('ranks.empty'))}
    <section class="stack-tight" aria-labelledby="duels-title">
      <h2 id="duels-title">⚔️ ${t('duel.title')}</h2>
      ${(d.duels || []).length ? html`<div class="stack">${d.duels.map(duelCard)}</div>` : html`<p class="caption measure">${t('duel.empty')}</p>`}
    </section>`;
}

/* --- Actions ---------------------------------------------------------------------------- */
const socialActions = {
  'forum-profile': el => forumGo('profile', el.dataset.id),
  'forum-me': () => forumGo('profile', account.user.id),
  'forum-chat': el => { forum.draft.message = ''; forumGo('chat', el.dataset.id); },
  'forum-view-friends': () => { forum.view = 'friends'; paint(); loadView(); },
  'forum-edit-profile': async () => {
    const mine = forum.profile;
    forum.d.edit = { avatar: mine.avatar, color: mine.color, bio: mine.bio || '', private: Boolean(mine.private), showStats: mine.showStats !== false };
    forum.draft.bio = forum.d.edit.bio;
    openSheet(editProfileSheet());
  },
  'forum-edit-color': el => { forum.d.edit.bio = $('#edit-bio').value; forum.d.edit.color = el.dataset.value; openSheet(editProfileSheet()); },
  'forum-edit-private': () => { forum.d.edit.bio = $('#edit-bio').value; forum.d.edit.private = !forum.d.edit.private; openSheet(editProfileSheet()); },
  'forum-edit-stats': () => { forum.d.edit.bio = $('#edit-bio').value; forum.d.edit.showStats = !forum.d.edit.showStats; openSheet(editProfileSheet()); },
  'forum-edit-save': async () => {
    const e = forum.d.edit;
    e.bio = $('#edit-bio').value.trim();
    try {
      await communityApi().updateProfile(e);
      forum.profile = await communityApi().profile();
      closeSheet();
      toast(t('profile.saved'));
      if (forum.page?.kind === 'profile') loadProfile(forum.page.id); else paint();
    } catch (error) {
      const line = $('#edit-error');
      line.hidden = false;
      line.textContent = t(error?.code === 'content_blocked' ? 'forum.errBlocked' : 'forum.postFailed');
    }
  },
  'forum-user-menu': el => openSheet(userMenuSheet(el.dataset.id, el.dataset.name)),
  'forum-follow': async el => {
    const p = forum.d.who;
    const on = !p.iFollow;
    const done = await forumTry(() => communityApi().follow(el.dataset.id, on).then(() => true));
    if (!done) return;
    p.iFollow = on; p.followers += on ? 1 : -1;
    buzz(8);
    paint();
  },
  'forum-friend-add': async el => {
    const done = await forumTry(() => communityApi().friendRequest(el.dataset.id).then(() => true));
    if (!done) return;
    toast(t('friends.requestSent'));
    if (forum.page?.kind === 'profile') loadProfile(forum.page.id); else loadFriends({ quiet: true });
  },
  'forum-friend-accept': async el => {
    const done = await forumTry(() => communityApi().friendRespond(el.dataset.id, true).then(() => true));
    if (!done) return;
    toast(t('friends.nowFriends'));
    buzz(14);
    if (forum.page?.kind === 'profile') loadProfile(forum.page.id); else loadFriends({ quiet: true });
  },
  'forum-friend-decline': async el => { if (await forumTry(() => communityApi().friendRespond(el.dataset.id, false).then(() => true))) loadFriends({ quiet: true }); },
  'forum-friend-cancel': async el => {
    if (!(await forumTry(() => communityApi().friendCancel(el.dataset.id).then(() => true)))) return;
    if (forum.page?.kind === 'profile') loadProfile(forum.page.id); else loadFriends({ quiet: true });
  },
  'forum-unfriend': async el => {
    if (!(await forumTry(() => communityApi().unfriend(el.dataset.id).then(() => true)))) return;
    closeSheet();
    forum.d.friends = null;
    loadProfile(el.dataset.id);
  },
  'forum-redeem': async () => {
    const code = forum.draft.code.trim();
    if (!code) return;
    const id = await forumTry(() => communityApi().redeem(code));
    if (!id) return;
    forum.draft.code = '';
    toast(t('friends.nowFriends'));
    buzz(14);
    loadFriends({ quiet: true });
  },
  'forum-share-code': () => shareText(t('friends.shareText', { code: forum.profile.inviteCode, name: forum.profile.username })),
  'forum-buddy': async () => {
    const other = await forumTry(() => communityApi().buddy().then(id => id || false));
    if (other === undefined) return;
    toast(t(other ? 'buddy.found' : 'buddy.looking'));
    buzz(14);
    loadFriends({ quiet: true });
  },
  'forum-buddy-cancel': async () => { await forumTry(() => communityApi().cancelBuddy().then(() => true)); loadFriends({ quiet: true }); },
  'forum-send': async () => {
    const body = forum.draft.message.trim();
    if (!body) return;
    forum.busy = true;
    try {
      await communityApi().send(forum.page.id, body);
      forum.draft.message = '';
      sfx('tap');
      forum.busy = false;
      await loadChat(forum.page.id);
      $('#chat-text')?.focus({ preventScroll: true });
    } catch (error) { forum.busy = false; forumError(error); paint(); }
  },
  // groups
  'forum-group': el => { forum.d.group = null; forumGo('group', el.dataset.id); },
  'forum-group-tab': el => { forum.d.group.tab = el.dataset.value; paint(); },
  'forum-group-new': () => { forum.d.newGroup = { name: '', description: '', emoji: '💪', isPrivate: false }; openSheet(newGroupSheet()); },
  'forum-group-emoji': el => { const g = forum.d.newGroup; g.name = $('#group-name').value; g.description = $('#group-desc').value; g.emoji = el.dataset.value; openSheet(newGroupSheet()); },
  'forum-group-private': () => { const g = forum.d.newGroup; g.name = $('#group-name').value; g.description = $('#group-desc').value; g.isPrivate = !g.isPrivate; openSheet(newGroupSheet()); },
  'forum-group-save': async () => {
    const g = forum.d.newGroup;
    g.name = $('#group-name').value.trim(); g.description = $('#group-desc').value.trim();
    const line = $('#group-error');
    if (g.name.length < 3) { line.hidden = false; line.textContent = t('group.errName'); return; }
    try {
      const id = await communityApi().createGroup(g);
      closeSheet();
      toast(t('group.created'));
      buzz(14);
      forum.d.groups = null;
      forumGo('group', id);
    } catch (error) {
      line.hidden = false;
      line.textContent = t(error?.code === 'content_blocked' ? 'forum.errBlocked' : error?.code === 'rate_limited' ? 'group.errLimit' : error?.code === 'username_taken' || error?.code === 'invalid' ? 'group.errTaken' : 'forum.postFailed');
    }
  },
  'forum-group-join': async el => {
    if (!(await forumTry(() => communityApi().joinGroup(el.dataset.id).then(() => true)))) return;
    toast(t('group.joined'));
    buzz(12);
    forum.d.groups = null;
    if (forum.page?.kind === 'group') loadGroup(forum.page.id); else loadGroups({ quiet: true });
  },
  'forum-group-code': async () => {
    const code = forum.draft.code.trim();
    if (!code) return;
    const id = await forumTry(() => communityApi().joinByCode(code));
    if (!id) return;
    forum.draft.code = '';
    toast(t('group.joined'));
    forum.d.groups = null;
    forumGo('group', id);
  },
  'forum-group-leave': async el => {
    if (!(await forumTry(() => communityApi().leaveGroup(el.dataset.id).then(() => true)))) return;
    toast(t('group.left'));
    forum.d.groups = null; forum.d.group = null;
    forumBack();
  },
  'forum-group-share': el => shareText(t('group.shareText', { name: el.dataset.name, code: el.dataset.code })),
  'forum-group-role': async el => { if (await forumTry(() => communityApi().setRole(forum.page.id, el.dataset.user, el.dataset.role).then(() => true))) loadGroup(forum.page.id); },
  'forum-group-kick': async el => { if (await forumTry(() => communityApi().removeMember(forum.page.id, el.dataset.user).then(() => true))) loadGroup(forum.page.id); },
  'forum-challenge-new': () => { forum.d.newChallenge = { title: '', metric: 'xp', days: 7 }; openSheet(newChallengeSheet()); },
  'forum-challenge-metric': el => { forum.d.newChallenge.title = $('#challenge-title').value; forum.d.newChallenge.metric = el.dataset.value; openSheet(newChallengeSheet()); },
  'forum-challenge-days': el => { forum.d.newChallenge.title = $('#challenge-title').value; forum.d.newChallenge.days = Number(el.dataset.value); openSheet(newChallengeSheet()); },
  'forum-challenge-save': async () => {
    const c = forum.d.newChallenge;
    c.title = $('#challenge-title').value.trim();
    const line = $('#challenge-error');
    if (c.title.length < 3) { line.hidden = false; line.textContent = t('forum.errTitle'); return; }
    try {
      await communityApi().createChallenge({ group: forum.page.id, ...c });
      closeSheet();
      toast(t('challenge.created'));
      buzz(14);
      loadGroup(forum.page.id);
    } catch (error) { line.hidden = false; line.textContent = t(error?.code === 'rate_limited' ? 'challenge.errLimit' : error?.code === 'content_blocked' ? 'forum.errBlocked' : 'forum.postFailed'); }
  },
  'forum-challenge-join': async el => { if (await forumTry(() => communityApi().joinChallenge(el.dataset.id, el.dataset.on === '1').then(() => true))) { buzz(10); loadGroup(forum.page.id); } },
  'forum-challenge-open': el => forumGo('challenge', el.dataset.id),
  // ranks and duels
  'forum-scope': el => { forum.d.scope = el.dataset.value; loadRanks(); },
  'forum-metric': el => { forum.d.metric = el.dataset.value; loadRanks(); },
  'forum-duel-sheet': el => { forum.d.duel = { metric: 'xp', days: 5 }; openSheet(duelSheet(el.dataset.id)); },
  'forum-duel-metric': el => { forum.d.duel.metric = el.dataset.value; openSheet(duelSheet($('[data-action="forum-duel-send"]').dataset.id)); },
  'forum-duel-days': el => { forum.d.duel.days = Number(el.dataset.value); openSheet(duelSheet($('[data-action="forum-duel-send"]').dataset.id)); },
  'forum-duel-send': async el => {
    if (!(await forumTry(() => communityApi().duelInvite(el.dataset.id, forum.d.duel.metric, forum.d.duel.days).then(() => true)))) return;
    closeSheet();
    toast(t('duel.sent'));
    buzz(14);
  },
  'forum-duel-accept': async el => { if (await forumTry(() => communityApi().duelRespond(el.dataset.id, true).then(() => true))) { toast(t('duel.started')); buzz(14); loadRanks({ quiet: true }); } },
  'forum-duel-decline': async el => { if (await forumTry(() => communityApi().duelRespond(el.dataset.id, false).then(() => true))) loadRanks({ quiet: true }); },
  'forum-duel-claim': el => {
    const paid = state.flags.duelPaid || (state.flags.duelPaid = {});
    if (paid[el.dataset.id]) return;
    paid[el.dataset.id] = 1;
    state.gems += DUEL_GEMS;
    saveState();
    toast(t('duel.claimed', { n: DUEL_GEMS }));
    buzz([20, 40, 30]);
    sfx('success');
    afterMotion(() => burst(innerWidth / 2, innerHeight * 0.4, { count: 40, spread: 240 }), 100);
    paint();
  },
};

// Search boxes for people and groups, and drafts of other fields, keep their text across repaints.
let peopleTimer = 0;
document.addEventListener('input', event => {
  const el = event.target;
  if (el.id === 'people-search') {
    clearTimeout(peopleTimer);
    peopleTimer = setTimeout(async () => {
      const query = el.value.trim();
      forum.d.people = query.length >= 2 ? await communityApi().people(query).catch(() => []) : [];
      paint();
      const box = $('#people-search');
      if (box) { box.focus({ preventScroll: true }); box.setSelectionRange(box.value.length, box.value.length); }
    }, 350);
  } else if (el.id === 'group-search') {
    clearTimeout(peopleTimer);
    peopleTimer = setTimeout(async () => {
      await loadGroups({ quiet: true });
      const box = $('#group-search');
      if (box) { box.focus({ preventScroll: true }); box.setSelectionRange(box.value.length, box.value.length); }
    }, 350);
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.id === 'chat-text') { event.preventDefault(); actions['forum-send'](); }
});
