/* ==========================================================================
   Accounts and sync
   The Android app supplies window.fatboyCloud (see apk/cloud/bridge.js). Without
   it, for example in a plain browser, the app stays local-only and shows no
   account controls.
   ========================================================================== */
const cloudApi = () => window.fatboyCloud || null;
const account = { user: null, busy: false, syncedAt: 0, failed: false };
let pushTimer = 0;

// Settings stay per device (language, theme); everything else follows the account.
const snapshot = () => {
  const { settings, ...rest } = state;
  return rest;
};

function queueSync() {
  if (!account.user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushState, 1500);
}

async function pushState() {
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

// The newer copy wins. A new phone has nothing local, so the account's copy is taken.
function adoptRemote(remote) {
  state = { ...createState(), ...remote.data, settings: state.settings, updatedAt: remote.updatedAt };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) { /* ignore */ }
  state.flags.figureShown = undefined;
  resetFigure();
  applySettings();
  ui.draft = null;
  ui.tab = 'learn';
  ui.profileView = 'main';
  paint({ entering: true });
}

async function syncAfterSignIn() {
  const api = cloudApi();
  account.busy = true;
  account.failed = false;
  try {
    const remote = await api.load();
    const remoteHasData = Boolean(remote?.data?.profile);
    if (remoteHasData && (!state.profile || remote.updatedAt > (state.updatedAt || 0))) adoptRemote(remote);
    else if (state.profile) await pushState();
    account.syncedAt = Date.now();
  } catch (error) {
    account.failed = true;
  }
  account.busy = false;
  paint();
}

function onAccountChange(user) {
  const wasSignedIn = Boolean(account.user);
  account.user = user;
  if (user && !wasSignedIn) {
    syncAfterSignIn();
    if (ui.tab === 'profile' || !state.profile) toast(t('toast.signedIn'));
  } else {
    paint();
  }
}

function startAccounts() {
  cloudApi()?.onChange(onAccountChange);
}

const googleMark = () => html`<svg class="icon google-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.8V6.5H1.4a12 12 0 0 0 0 11z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>`;

const signInButton = () => html`<button class="btn btn-tonal" data-action="sign-in">${googleMark()}${t('account.google')}</button>`;

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
