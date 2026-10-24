// Connects the FatBoy page to Supabase (accounts and sync) and to the phone (file saving).
// It defines window.fatboyCloud for account.js and a window.claude-compatible object so the
// recipe assistant and file export work unchanged outside the preview viewer.
import { createClient } from '@supabase/supabase-js';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

// Accept whatever was pasted (e.g. .../rest/v1/) and keep only the project origin.
const URL_ = (() => {
  const raw = String(__SUPABASE_URL__ || '').trim();
  try { return raw ? new URL(raw.startsWith('http') ? raw : `https://${raw}`).origin : ''; } catch { return ''; }
})();
const KEY = String(__SUPABASE_ANON_KEY__ || '').trim();
const SCHEME = 'com.fatboy.app://auth';

const failure = (code, message) => Object.assign(new Error(message || code), { code });

// Turns Supabase auth errors into short codes the page can translate.
const authFailure = error => {
  const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  let code = 'generic';
  if (/invalid login|invalid_credentials/.test(text)) code = 'invalid_credentials';
  else if (/already registered|already been registered|user_already_exists/.test(text)) code = 'email_taken';
  else if (/password|weak_password/.test(text)) code = 'weak_password';
  else if (/not confirmed|email_not_confirmed/.test(text)) code = 'email_unconfirmed';
  else if (/rate|too many|over_email_send_rate_limit|429/.test(text)) code = 'rate_limited';
  else if (/valid email|email_address_invalid|invalid email/.test(text)) code = 'invalid_email';
  else if (/fetch|network/.test(text)) code = 'network';
  return failure(code, error?.message);
};

// Saves a text file to the phone's cache and opens the share sheet so the person can pick where it goes.
const downloads = {
  async save({ filename, data }) {
    const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache, encoding: 'utf8' });
    try {
      await Share.share({ title: filename, url: uri });
    } catch (error) {
      throw failure('declined');
    }
  },
};

let sample = null;

if (URL_ && KEY) {
  const client = createClient(URL_, KEY, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  // Google sign-in runs in the system browser and returns through the com.fatboy.app link.
  const report = message => window.dispatchEvent(new CustomEvent('fatboy-auth-error', { detail: String(message || '') }));
  let listeners = [];
  let lastSignIn = 0;
  const announce = session => listeners.forEach(callback => callback(userOf(session)));

  App.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith(SCHEME)) return;
    await Browser.close().catch(() => {});
    try {
      const link = new URL(url.replace(SCHEME, 'https://auth.local/'));
      const params = new URLSearchParams(link.hash.replace(/^#/, ''));
      link.searchParams.forEach((value, key) => params.set(key, value));
      const problem = params.get('error_description') || params.get('error');
      if (problem) return report(problem);
      const code = params.get('code');
      let result;
      if (code) result = await client.auth.exchangeCodeForSession(code);
      else if (params.get('access_token') && params.get('refresh_token')) {
        result = await client.auth.setSession({ access_token: params.get('access_token'), refresh_token: params.get('refresh_token') });
      } else return report('no code in the return link');
      if (result.error) return report(result.error.message);
      announce(result.data.session);
    } catch (error) {
      report(error?.message || error);
    }
  });

  const userOf = session => (session?.user
    ? { id: session.user.id, email: session.user.email || session.user.user_metadata?.email || '' }
    : null);

  window.fatboyCloud = {
    onChange(callback) {
      listeners.push(callback);
      client.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') window.dispatchEvent(new CustomEvent('fatboy-password-recovery'));
        callback(userOf(session));
      });
    },
    async signIn() {
      if (Date.now() - lastSignIn < 4000) return;   // a double tap would open two sign-in tabs
      lastSignIn = Date.now();
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: SCHEME, skipBrowserRedirect: true },
      });
      if (error) throw error;
      // the gateway wants the key on the authorize URL too
      const target = new URL(data.url);
      if (!target.searchParams.has('apikey')) target.searchParams.set('apikey', KEY);
      await Browser.open({ url: target.toString() });
    },
    // Email and password accounts. Supabase sends the confirmation or reset email itself.
    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: SCHEME } });
      if (error) throw authFailure(error);
      // An address that already exists comes back with no identities (so nobody can probe for emails).
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw failure('email_taken');
      if (data.session) announce(data.session);
      return { needsConfirm: !data.session };
    },
    async signInEmail(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw authFailure(error);
      announce(data.session);
    },
    async resetPassword(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: SCHEME });
      if (error) throw authFailure(error);
    },
    async setPassword(password) {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw authFailure(error);
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
    async load() {
      const { data, error } = await client.from('user_state').select('data, updated_at').maybeSingle();
      if (error) throw error;
      return data ? { data: data.data, updatedAt: new Date(data.updated_at).getTime() } : null;
    },
    async save(data, updatedAt) {
      const { data: { user } } = await client.auth.getUser();
      if (!user) throw failure('account_required');
      const { error } = await client.from('user_state').upsert({
        user_id: user.id, data, updated_at: new Date(updatedAt).toISOString(),
      });
      if (error) throw error;
    },
    // Social: usernames, forum, friends, groups, ranks (see supabase/community.sql and social.sql).
    community: (() => {
      const camel = row => (row && typeof row === 'object' && !Array.isArray(row)
        ? Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), value]))
        : row);
      const rows = data => (Array.isArray(data) ? data.map(camel) : []);
      const wrap = async (promise, map = d => d) => {
        const { data, error } = await promise;
        if (error) {
          const text = `${error.message || ''}`;
          for (const code of ['rate_limited', 'content_blocked', 'not_a_member', 'username_required', 'account_required', 'age_required', 'forbidden', 'not_found']) {
            if (text.includes(code)) throw failure(code);
          }
          if (error.code === '23505') throw failure('username_taken');
          if (error.code === '23514') throw failure('invalid');
          throw failure('failed', text);
        }
        return map(data);
      };
      const rpc = (name, args) => wrap(client.rpc(name, args));
      const me = async () => (await client.auth.getUser()).data.user;
      const at = row => ({ ...camel(row), at: new Date(row.created_at || row.created).getTime() });
      return {
        profile: async () => {
          const data = await rpc('my_profile');
          return data && data[0] ? camel(data[0]) : null;
        },
        claim: (username, ageOk) => rpc('claim_username', { p_name: username, p_age_ok: ageOk }),
        updateProfile: p => rpc('update_profile', { p_avatar: p.avatar, p_color: p.color, p_bio: p.bio, p_private: p.private, p_show_stats: p.showStats }),
        syncStats: s => rpc('sync_stats', { p_xp: s.xp, p_streak: s.streak, p_badges: s.badges, p_day: s.day, p_day_xp: s.dayXp, p_day_lessons: s.dayLessons, p_day_logs: s.dayLogs }),
        publicProfile: async id => { const data = await rpc('public_profile', { p_user: id }); return data && data[0] ? at(data[0]) : null; },
        feed: async ({ category, before, following, group, query, author } = {}) => (await rpc('forum_feed', {
          p_category: category || null, p_before: before ? new Date(before).toISOString() : null, p_limit: 20,
          p_following: Boolean(following), p_group: group || null, p_query: query || null, p_author: author || null,
        })).map(at),
        post: async id => { const data = await rpc('forum_post', { p_id: id }); return data && data[0] ? at(data[0]) : null; },
        comments: async id => (await rpc('forum_comments', { p_post: id })).map(at),
        createPost: async ({ category, title, body, image, poll, group }) => {
          const user = await me();
          await wrap(client.from('posts').insert({ user_id: user.id, category, title, body, image: image || null, poll: poll || null, group_id: group || null }));
        },
        addComment: async (postId, body) => {
          const user = await me();
          await wrap(client.from('comments').insert({ post_id: postId, user_id: user.id, body }));
        },
        remove: (kind, id) => wrap(client.from(kind === 'post' ? 'posts' : 'comments').delete().eq('id', id)),
        modRemove: id => rpc('mod_remove_post', { p_post: id }),
        react: (postId, kind) => rpc('react', { p_post: postId, p_kind: kind || null }),
        vote: (postId, option) => rpc('vote', { p_post: postId, p_option: option }),
        uploadImage: async blob => {
          const user = await me();
          const path = `${user.id}/${crypto.randomUUID()}.jpg`;
          const { error } = await client.storage.from('post-images').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
          if (error) throw failure('failed', error.message);
          return path;
        },
        imageUrl: path => client.storage.from('post-images').getPublicUrl(path).data.publicUrl,
        report: (kind, id, reason) => rpc('report_content', { p_kind: kind, p_id: id, p_reason: reason }),
        block: async (userId, on) => {
          const user = await me();
          await wrap(on
            ? client.from('blocks').upsert({ blocker_id: user.id, blocked_id: userId })
            : client.from('blocks').delete().eq('blocker_id', user.id).eq('blocked_id', userId));
        },
        blocked: async () => rows(await rpc('forum_blocked_v2')),
        follow: (userId, on) => rpc('follow_user', { p_user: userId, p_on: on }),
        friends: async () => (await rpc('my_friends')).map(at),
        requests: async () => rows(await rpc('my_requests')),
        people: async query => rows(await rpc('people', { p_query: query })),
        friendRequest: id => rpc('friend_request', { p_user: id }),
        friendRespond: (id, accept) => rpc('friend_respond', { p_user: id, p_accept: accept }),
        friendCancel: id => rpc('friend_cancel', { p_user: id }),
        unfriend: id => rpc('unfriend', { p_user: id }),
        redeem: code => rpc('redeem_invite', { p_code: code }),
        send: (to, body) => rpc('send_message', { p_to: to, p_body: body }),
        conversation: async id => (await rpc('conversation', { p_with: id })).map(at),
        groups: async () => rows(await rpc('my_groups')),
        discoverGroups: async query => rows(await rpc('discover_groups', { p_query: query || null })),
        createGroup: g => rpc('create_group', { p_name: g.name, p_description: g.description, p_emoji: g.emoji, p_private: g.isPrivate }),
        joinGroup: (id, code) => rpc('join_group', { p_group: id, p_code: code || null }),
        joinByCode: code => rpc('join_group_by_code', { p_code: code }),
        leaveGroup: id => rpc('leave_group', { p_group: id }),
        groupMembers: async id => rows(await rpc('group_members_list', { p_group: id })),
        setRole: (group, user, role) => rpc('set_member_role', { p_group: group, p_user: user, p_role: role }),
        removeMember: (group, user) => rpc('remove_member', { p_group: group, p_user: user }),
        challenges: async group => rows(await rpc('group_challenges', { p_group: group })),
        createChallenge: c => rpc('create_challenge', { p_group: c.group, p_title: c.title, p_metric: c.metric, p_days: c.days }),
        joinChallenge: (id, on) => rpc('join_challenge', { p_challenge: id, p_on: on }),
        challengeBoard: async id => rows(await rpc('challenge_board', { p_challenge: id })),
        duels: async () => rows(await rpc('my_duels')),
        duelInvite: (user, metric, days) => rpc('duel_invite', { p_user: user, p_metric: metric, p_days: days }),
        duelRespond: (id, accept) => rpc('duel_respond', { p_duel: id, p_accept: accept }),
        leaderboard: async (scope, metric) => rows(await rpc('leaderboard', { p_scope: scope, p_metric: metric })),
        notifications: async () => (await rpc('my_notifications', { p_limit: 40 })).map(at),
        unread: async () => {
          const [notes, messages] = await Promise.all([rpc('unread_notifications'), rpc('unread_messages')]);
          return { notifications: notes || 0, messages: messages || 0 };
        },
        readNotifications: () => rpc('read_notifications'),
        buddy: async () => rpc('request_buddy'),
        cancelBuddy: () => rpc('cancel_buddy'),
        buddyWaiting: () => rpc('buddy_waiting'),
        tip: async () => { const data = await rpc('tip_of_the_week'); return data && data[0] ? camel(data[0]) : null; },
      };
    })(),
    async deleteAccount() {
      const { error } = await client.rpc('delete_my_account');
      if (error) throw error;
      await client.auth.signOut();
    },
  };

  // AI recipes (Gemini) go through the "recipe" edge function so the API key never ships in the app.
  sample = {
    async json(prompt, { signal } = {}) {
      const { data: { session } } = await client.auth.getSession();
      if (!session) throw failure('account_required');
      let response;
      try {
        response = await fetch(`${URL_}/functions/v1/recipe`, {
          method: 'POST',
          signal,
          headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ prompt }),
        });
      } catch (error) {
        throw failure(error.name === 'AbortError' ? 'cancelled' : 'failed');
      }
      if (response.status === 401) throw failure('session_expired');
      if (response.status === 429) throw failure('rate_limited');
      if (!response.ok) throw failure('failed');
      return response.json();
    },
  };

}

window.claude = window.claude || {};
const original = window.claude.use?.bind(window.claude);
window.claude.use = async name => {
  if (name === 'sample' && sample) return sample;
  if (name === 'downloads') return downloads;
  return original ? original(name) : null;
};


// Google's code scanner opens its own camera screen, so the app needs no camera permission.
// Android back button: let the page close sheets and go back first; leave the app only from the home tab.
App.addListener('backButton', () => {
  const leave = window.dispatchEvent(new CustomEvent('fatboy-back', { cancelable: true }));
  if (leave) App.exitApp();
});

window.fatboyScan = {
  async scan() {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) await BarcodeScanner.installGoogleBarcodeScannerModule();
    const { barcodes } = await BarcodeScanner.scan({
      formats: [BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA, BarcodeFormat.UpcE],
    });
    return barcodes[0]?.rawValue ?? null;
  },
};


// Sharing: text, or a picture made on the page (blob) handed to the phone's share sheet.
window.fatboyShare = {
  async text(text) { await Share.share({ text }); },
  async image(blob, name, text) {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const { uri } = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
    await Share.share({ text, url: uri });
  },
};

// Reminders are scheduled on the phone itself (no server): a daily nudge plus one-offs.
window.fatboyNotify = {
  async enable() {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    return (await LocalNotifications.requestPermissions()).display === 'granted';
  },
  async schedule(items) {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications });
    if (!items.length) return;
    await LocalNotifications.schedule({
      notifications: items.map(item => ({
        id: item.id, title: item.title, body: item.body,
        schedule: item.daily ? { on: { hour: item.hour, minute: item.minute }, allowWhileIdle: true } : { at: new Date(item.at), allowWhileIdle: true },
      })),
    });
  },
};
