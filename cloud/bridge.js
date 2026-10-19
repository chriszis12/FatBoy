// Connects the FatBoy page to Supabase (accounts and sync) and to the phone (file saving).
// It defines window.fatboyCloud for account.js and a window.claude-compatible object so the
// recipe assistant and file export work unchanged outside the preview viewer.
import { createClient } from '@supabase/supabase-js';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

// Accept whatever was pasted (e.g. .../rest/v1/) and keep only the project origin.
const URL_ = (() => {
  const raw = String(__SUPABASE_URL__ || '').trim();
  try { return raw ? new URL(raw.startsWith('http') ? raw : `https://${raw}`).origin : ''; } catch { return ''; }
})();
const KEY = String(__SUPABASE_ANON_KEY__ || '').trim();
const SCHEME = 'com.fatboy.app://auth';

const failure = (code, message) => Object.assign(new Error(message || code), { code });

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
  App.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith(SCHEME)) return;
    await Browser.close().catch(() => {});
    const params = new URL(url.replace(SCHEME, 'https://auth.local/')).searchParams;
    const code = params.get('code');
    if (code) await client.auth.exchangeCodeForSession(code).catch(() => {});
  });

  const userOf = session => (session?.user
    ? { id: session.user.id, email: session.user.email || session.user.user_metadata?.email || '' }
    : null);

  window.fatboyCloud = {
    onChange(callback) {
      client.auth.onAuthStateChange((_event, session) => callback(userOf(session)));
    },
    async signIn() {
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
