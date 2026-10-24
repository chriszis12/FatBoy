# FatBoy 1.0.0 release pack

## 1. Fill these (I can't know them)
In `legal/*.html` replace: `[YOUR NAME OR COMPANY]`, `spacelandstudios@protonmail.com`, `[COUNTRY]`, `[DATE]`, `[PLACEHOLDER]`.
Host the 3 pages (GitHub Pages is free: Settings > Pages > deploy from /legal). You'll get URLs for privacy, terms, delete-account.

## 2. Play Console setup
- Create developer account (one-time $25). Personal accounts: closed test with **12+ testers opted in for 14 days** before you can apply for production.
- Create app > Free > fill the store listing below.
- Content rating questionnaire: health/fitness, user-generated content (community), no gambling.
- Target audience: 13+ (or 18+ to be safe). Not a children's app.
- Health apps declaration: not a medical device, general wellness only.
- Account deletion: add the delete-account URL, and in-app path is Profile > Settings > Delete account.
- Privacy policy URL: your hosted privacy page.

## 3. Data safety form (answers)
Collected: email, name/username, user-generated content (posts, comments), health & fitness info (weight, meals, water, workouts, measurements), app activity.
Purpose: app functionality, account management. Not used for ads. Not sold.
Shared with third parties: no (Supabase acts as processor). Encrypted in transit: yes. Users can request deletion: yes.
Optional: all health data is optional; login is required only for cloud sync and Social.

## 4. Store listing
Title: FatBoy: Weight Loss Lessons
Short (80): Learn, log and level up. Bite-size lessons and tracking for steady weight loss.
Full: FatBoy turns healthy habits into quick lessons. Learn how calories, protein and sleep work, log food, water, fasting and workouts, earn XP and streaks, and join friends in Social. Customize the look with five accent themes, adjustable frosted glass and your own text size. General wellness only, not medical advice.
Category: Health & Fitness. Contact email: yours.

## 5. Assets
- Icon 512x512, feature graphic 1024x500, 2-8 phone screenshots (take from the app in dark + light).

## 6. Before upload
- Build a signed **AAB** (not APK) in GitHub Actions with your release keystore; keep the keystore safe forever.
- Bump `versionCode` in `android/app/build.gradle` every upload.
- Run the three SQL files in Supabase in order, enable Email + Google providers, set SMTP.
- Test on a real phone: Google login, email signup/reset, notifications, share, delete account.

## 7. Signed AAB (Play Store build)
1. Make a keystore once (on any computer with Java):
   `keytool -genkeypair -v -keystore release.jks -alias fatboy -keyalg RSA -keysize 2048 -validity 10000`
   **Back it up somewhere safe. Lose it and you can never update the app.**
2. Turn it into text: `base64 -w0 release.jks` (Mac: `base64 -i release.jks`).
3. GitHub repo > Settings > Secrets > Actions, add: `KEYSTORE_BASE64` (that text), `KEYSTORE_PASSWORD`, `KEY_ALIAS` (fatboy), `KEY_PASSWORD`.
4. Actions tab > "Build Play Store AAB" > Run workflow, enter a versionCode (1, then 2, 3...).
5. Download `fatboy-release-aab`, upload it to Play Console. Opt in to Play App Signing when asked.
Old debug APKs are signed differently: uninstall them before installing a release build.
