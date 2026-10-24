# FatBoy: accounts and Android app

The app works without any of this (progress stays on the phone). Follow these steps to turn on
Google sign-in, cloud sync, AI recipes and the APK.

## 1. Supabase project

1. Create a project at supabase.com. Copy the **Project URL** and the **anon public key**
   (Project Settings, API).
2. Open the SQL editor and run `supabase/schema.sql`. It creates the sync table, row-level
   security, the delete-account function and a daily counter for recipes.
   Then run `supabase/community.sql` the same way. It adds usernames, the forum, reports and blocks.
   Then run `supabase/social.sql` the same way (once, after `community.sql`; never re-run `community.sql` afterwards). It adds profiles, friends, DMs, groups, challenges, duels, leagues, notifications, polls, reactions, the word filter (`banned_words` table) and the `post-images` storage bucket for photo posts. `social.sql` itself can be re-run safely.
   Reports land in the `reports` table (Table editor); three different reporters hide a post automatically.

## 2. Google sign-in

1. In Google Cloud Console, create an OAuth client of type **Web application**.
   Add this authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`.
2. In Supabase, Authentication, Sign In / Providers, enable **Google** and paste the client ID and secret.
3. In Supabase, Authentication, URL Configuration, add `com.fatboy.app://auth` to **Redirect URLs**.

### Email accounts (besides Google)

1. In Supabase, Authentication, Sign In / Providers, make sure **Email** is enabled.
2. Decide on **Confirm email**. On: people must click a link in an email before they can sign in (safer, but the free built-in email sender is limited to a few emails per hour,
   so set up your own SMTP, for example Resend, under Authentication, SMTP Settings). Off: sign-up logs people in at once (easier, less safe).
3. Under Authentication, Sign In / Providers, Email, set the minimum password length to 8. If your plan has it, turn on leaked password protection.
4. Under Authentication, Email Templates, you can reword the confirmation and reset emails. The links come back into the app through `com.fatboy.app://auth`.
5. Reset password: the person taps the emailed link, the app opens and asks for a new password.

## 3. AI recipes with Gemini (optional)

```
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase secrets set GEMINI_API_KEY=<your key from aistudio.google.com>
supabase functions deploy recipe
```

Signed-in users can then get recipes inside the APK. The free limit (2 a day) is enforced in
the app; the function also stops any account at 60 a day. The model defaults to `gemini-3.8-flash`;
to use another, run `supabase secrets set GEMINI_MODEL=<model name>`.

## 4. Build the APK

**On GitHub (no Android tools needed).** Push this folder to a GitHub repository, add the
repository secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Settings, Secrets and variables,
Actions), then run the **Build Android APK** workflow. Download `fatboy-debug-apk` from the run.

**On your computer.** Needs Node 22, JDK 21 and the Android SDK (Android Studio installs both).

```
npm ci
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_ANON_KEY=... npm run apk
```

The APK is at `android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to a phone and open it
(allow installs from your file manager when asked).

## Notes

- Food search and barcode lookup use the free Open Food Facts database. The camera scanner is Google's code scanner and
  only exists in the APK; in a browser the barcode number is typed by hand.
- Progress photos live in the phone's own storage and are not in backups or cloud sync.
- There is no home screen widget yet: it needs native Android code that has to be built and tested on a device.

- Sync keeps the newer copy of your progress. Language and theme stay per device.
- Plus is still a local switch for testing. Real payments will need Play Billing or a payment
  provider plus a server-checked flag, so a copied backup cannot unlock it.
- A release build for the Play Store needs a signing key: `./gradlew bundleRelease` after setting
  one up in Android Studio (Build, Generate Signed Bundle).
- Deleting an account in the app removes the account and the cloud copy. Progress on the phone is
  removed with Settings, Reset all data.

## Troubleshooting Google sign-in

If the app says "Sign-in did not finish ... Unable to exchange external code", Google rejected the code when Supabase tried to use it.
That is a settings problem, not an app problem. Check, in order:

1. Supabase, Authentication, Sign In / Providers, Google: re-paste the **Client ID** and **Client secret** from the same Google OAuth client,
   with no spaces before or after. If you ever reset the secret in Google Cloud, the old one stops working.
2. The Google OAuth client must be of type **Web application** (not Android), with the authorized redirect URI
   `https://<your-project-ref>.supabase.co/auth/v1/callback`.
3. If the Google consent screen is in "Testing", add your Google account under Test users (or publish the app).
4. Wait a minute after saving, then tap Continue with Google once (a double tap opens two sign-in tabs).
