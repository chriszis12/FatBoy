/* ==========================================================================
   Accounts and sync
   The Android app supplies window.fatboyCloud (see apk/cloud/bridge.js). Without
   it, for example in a plain browser, the app stays local-only and shows no
   account controls.
   ========================================================================== */
const cloudApi = () => window.fatboyCloud || null;
const account = { user: null, busy: false, syncedAt: 0, failed: false };
let pushTimer = 0;

// Everything follows the account: progress, stats and settings.
const snapshot = () => ({ ...state });

function queueSync() {
  if (!account.user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushState, 1500);
}

async function pushState() {
  pushTimer = 0;
  const api = cloudApi();
  if (!api || !account.user || !state.profile) return;
  try {
    await api.save(snapshot(), state.updatedAt || Date.now());
    account.syncedAt = Date.now();
    account.failed = false;
  } catch (error) {
    account.failed = true;
  }
  if (ui.tab === 'profile' && ui.profileView === 'settings') paint();
}

// Another phone's copy replaces this one. A background refresh keeps the screen the person is on.
function adoptRemote(remote, { quiet = false } = {}) {
  const fresh = createState();
  state = { ...fresh, ...remote.data, settings: { ...fresh.settings, ...(remote.data.settings || {}) }, updatedAt: remote.updatedAt };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) { /* ignore */ }
  state.flags.figureShown = undefined;
  resetFigure();
  applySettings();
  if (!quiet) {
    ui.draft = null;
    ui.tab = 'learn';
    ui.profileView = 'main';
  }
  paint({ entering: !quiet });
}

const LINK_KEY = 'fatboy.linked';
const linkedBefore = () => { try { return localStorage.getItem(LINK_KEY) === account.user?.id; } catch (error) { return false; } };
const markLinked = () => { try { localStorage.setItem(LINK_KEY, account.user.id); } catch (error) { /* ignore */ } };

// First time this phone meets the account: the copy with more progress wins, so a quick
// new-phone setup cannot wipe a long streak. After that, the newer copy wins.
function remoteWins(remote) {
  if (!remote?.data?.profile) return false;
  if (!state.profile) return true;
  if (!linkedBefore()) {
    const mine = state.xp || 0;
    const theirs = remote.data.xp || 0;
    return theirs !== mine ? theirs > mine : remote.updatedAt > (state.updatedAt || 0);
  }
  return remote.updatedAt > (state.updatedAt || 0);
}

async function syncAfterSignIn() {
  const api = cloudApi();
  account.busy = true;
  account.failed = false;
  try {
    const remote = await api.load();
    if (remoteWins(remote)) adoptRemote(remote);
    else if (state.profile) await pushState();
    markLinked();
    account.syncedAt = Date.now();
  } catch (error) {
    account.failed = true;
  }
  account.busy = false;
  paint();
}

// Pick up changes made on another phone while this one is open.
async function refreshFromAccount() {
  const api = cloudApi();
  if (!api || !account.user || account.busy || pushTimer) return;
  if (typeof session !== 'undefined' && session) return;          // never swap data mid-lesson
  if (roots.sheet.childElementCount || document.activeElement?.matches('input, textarea')) return;
  try {
    const remote = await api.load();
    if (remote?.data?.profile && state.profile && remote.updatedAt > (state.updatedAt || 0) + 500 && !pushTimer) {
      adoptRemote(remote, { quiet: true });
    }
    account.syncedAt = Date.now();
    account.failed = false;
  } catch (error) { /* try again next time */ }
}

function onAccountChange(user) {
  const wasSignedIn = Boolean(account.user);
  if ((user && user.id) !== (account.user && account.user.id)) forumReset();
  account.user = user;
  if (user && !wasSignedIn) {
    syncAfterSignIn();
    if (ui.tab === 'profile' || !state.profile) toast(t('toast.signedIn'));
  } else {
    paint();
  }
  if (ui.tab === 'forum') forumEnter();
}

function startAccounts() {
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshFromAccount(); });
  window.addEventListener('focus', refreshFromAccount);
  setInterval(() => { if (!document.hidden) refreshFromAccount(); }, 30000);
  cloudApi()?.onChange(onAccountChange);
  window.addEventListener('fatboy-auth-error', event => toast(/exchange external code|invalid_client|invalid_grant/i.test(event.detail) ? t('account.googleRejected') : `${t('account.signInFailed')} (${event.detail})`.slice(0, 160)));
}

const googleMark = () => html`<svg class="icon google-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.8V6.5H1.4a12 12 0 0 0 0 11z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>`;

const signInButton = () => html`
  <div class="stack-tight fill">
    <button class="btn btn-tonal" data-action="sign-in">${googleMark()}${t('account.google')}</button>
    <button class="btn btn-tonal" data-action="auth-open" data-mode="signin">${icon('send')}${t('account.emailContinue')}</button>
  </div>`;

function accountCard() {
  if (!cloudApi()) return '';
  const { user } = account;
  const status = account.busy ? t('account.syncing')
    : account.failed ? t('account.syncFailed')
    : account.syncedAt ? t('account.synced', { time: new Date(account.syncedAt).toLocaleTimeString(state.settings.language, { hour: 'numeric', minute: '2-digit' }) })
    : '';
  return html`
    <section class="card" aria-labelledby="account-title">
      <h2 id="account-title">${t('account.title')}</h2>
      ${user
        ? html`<p class="caption measure">${t('account.signedIn', { email: user.email })}</p>
               ${forum.profile ? html`<p class="caption">${t('account.username', { name: forum.profile.username })}</p>` : ''}
               ${status ? html`<p class="caption" role="status">${status}</p>` : ''}
               <div class="row row-wrap">
                 <button class="btn btn-tonal" data-action="sign-out">${t('account.signOut')}</button>
                 <button class="btn btn-plain btn-danger" data-action="show-delete-account">${t('account.delete')}</button>
               </div>`
        : html`<p class="caption measure">${t('account.help')}</p>${signInButton()}`}
    </section>`;
}

const deleteAccountSheet = () => ({
  label: t('account.delete'),
  body: html`
    ${sheetHeader(t('account.deleteTitle'))}
    <p>${t('account.deleteBody')}</p>
    <button class="btn btn-large" data-action="close-sheet">${t('reset.keep')}</button>
    <button class="btn btn-plain btn-danger" data-action="confirm-delete-account">${t('account.deleteConfirm')}</button>`,
});


/* --- Email accounts (Supabase email and password) ----------------------------------------------- */
const auth = { mode: 'signin', busy: false, error: '', info: '', agree: false, email: '' };

const authErrorText = error => {
  const code = error?.code || '';
  const known = { invalid_credentials: 'account.errCredentials', email_taken: 'account.errTaken', weak_password: 'account.errWeak', email_unconfirmed: 'account.errUnconfirmed', rate_limited: 'account.errRate', invalid_email: 'account.errEmail', network: 'account.errNetwork' };
  return t(known[code] || 'account.errGeneric');
};

function emailSheet() {
  const m = auth.mode;
  const signup = m === 'signup';
  const reset = m === 'reset';
  const recover = m === 'recover';
  const title = t(`account.${m === 'signin' ? 'signInTitle' : m === 'signup' ? 'signUpTitle' : m === 'reset' ? 'resetTitle' : 'recoverTitle'}`);
  return {
    label: title,
    body: html`
      ${sheetHeader(title, reset ? t('account.resetHelp') : recover ? t('account.recoverHelp') : '')}
      <form class="stack" data-auth-form novalidate>
        ${recover ? '' : html`
          <div class="field">
            <label for="auth-email">${t('account.email')}</label>
            <input class="input" id="auth-email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" maxlength="120" value="${auth.email}">
          </div>`}
        ${reset ? '' : html`
          <div class="field">
            <label for="auth-password">${recover ? t('account.newPassword') : t('account.password')}</label>
            <input class="input" id="auth-password" type="password" autocomplete="${signup || recover ? 'new-password' : 'current-password'}" maxlength="72">
            ${signup || recover ? html`<p class="caption">${t('account.passwordHelp')}</p>` : ''}
          </div>`}
        ${signup ? html`
          <button type="button" class="choice" role="checkbox" aria-checked="${String(auth.agree)}" data-action="auth-agree">
            <span class="check-box">${auth.agree ? icon('check') : ''}</span><span>${t('account.agreeTerms')}</span>
          </button>
          <div class="row row-wrap"><button type="button" class="btn btn-plain" data-action="show-terms">${t('legal.termsTitle')}</button><button type="button" class="btn btn-plain" data-action="show-privacy">${t('legal.privacyTitle')}</button></div>` : ''}
        ${auth.error ? html`<p class="error" role="alert">${auth.error}</p>` : ''}
        ${auth.info ? html`<p class="caption" role="status">${auth.info}</p>` : ''}
        <button class="btn btn-large" type="submit" ${attributes({ disabled: auth.busy })}>${auth.busy ? t('account.working') : t(`account.${m === 'signin' ? 'signInButton' : m === 'signup' ? 'signUpButton' : m === 'reset' ? 'resetButton' : 'recoverButton'}`)}</button>
      </form>
      ${recover ? '' : html`
        <div class="row row-wrap center-row">
          ${m !== 'signin' ? html`<button class="btn btn-plain" data-action="auth-mode" data-mode="signin">${t('account.haveAccount')}</button>` : ''}
          ${m !== 'signup' ? html`<button class="btn btn-plain" data-action="auth-mode" data-mode="signup">${t('account.createAccount')}</button>` : ''}
          ${m === 'signin' ? html`<button class="btn btn-plain" data-action="auth-mode" data-mode="reset">${t('account.forgot')}</button>` : ''}
        </div>`}`,
  };
}

const openAuth = mode => {
  auth.mode = mode; auth.error = ''; auth.info = ''; auth.busy = false;
  openSheet(emailSheet());
  setTimeout(() => (document.getElementById('auth-email') || document.getElementById('auth-password'))?.focus(), 80);
};

function readAuthFields() {
  auth.email = (document.getElementById('auth-email')?.value || auth.email).trim();
  return { email: auth.email, password: document.getElementById('auth-password')?.value || '' };
}

async function submitAuth() {
  const api = cloudApi();
  const { email, password } = readAuthFields();
  const m = auth.mode;
  auth.error = ''; auth.info = '';
  if (m !== 'recover' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { auth.error = t('account.errEmail'); return openSheet(emailSheet()); }
  if ((m === 'signup' || m === 'recover') && password.length < 8) { auth.error = t('account.errWeak'); return openSheet(emailSheet()); }
  if (m === 'signin' && !password) { auth.error = t('account.errCredentials'); return openSheet(emailSheet()); }
  if (m === 'signup' && !auth.agree) { auth.error = t('account.errAgree'); return openSheet(emailSheet()); }
  auth.busy = true; openSheet(emailSheet());
  try {
    if (m === 'signin') { await api.signInEmail(email, password); closeSheet(); auth.busy = false; return; }
    if (m === 'signup') {
      const result = await api.signUp(email, password);
      auth.busy = false;
      if (result?.needsConfirm) { auth.mode = 'signin'; auth.info = t('account.checkEmail'); return openSheet(emailSheet()); }
      closeSheet(); return;
    }
    if (m === 'reset') { await api.resetPassword(email); auth.busy = false; auth.info = t('account.resetSent'); return openSheet(emailSheet()); }
    if (m === 'recover') { await api.setPassword(password); auth.busy = false; closeSheet(); toast(t('account.passwordChanged')); return; }
  } catch (error) {
    auth.error = authErrorText(error);
  }
  auth.busy = false;
  openSheet(emailSheet());
}

document.addEventListener('submit', event => {
  if (!event.target.closest('[data-auth-form]')) return;
  event.preventDefault();
  submitAuth();
});

window.addEventListener('fatboy-password-recovery', () => openAuth('recover'));

const authActions = {
  'auth-open': el => openAuth(el.dataset.mode || 'signin'),
  'auth-mode': el => { readAuthFields(); auth.mode = el.dataset.mode; auth.error = ''; auth.info = ''; openSheet(emailSheet()); },
  'auth-agree': () => { readAuthFields(); auth.agree = !auth.agree; openSheet(emailSheet()); },
};
