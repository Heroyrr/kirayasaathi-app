# Push notifications: setup, step by step (KirayaSaathi, Android)

How it works: the phone gets a token from Expo → the app saves it in Supabase (`push_tokens`) →
a database trigger (new RoomIndeed lead) or `admin_send_notice()` calls the Edge Function `send-push` →
it posts to the Expo push service → Expo hands the message to Firebase Cloud Messaging (FCM) → your owner's phone.

Firebase Cloud Messaging is free and needs no billing account.
Push does **not** work in Expo Go or on the web. Test only on a real build (the EAS APK).

Things only YOU can do are marked **[YOU]**. Everything else is already in the code.

---

## A. Firebase project and `google-services.json`  [YOU]

1. Open https://console.firebase.google.com and click **Create a project** (name: KirayaSaathi). You can switch Google Analytics off.
2. On the project home click the **Android** icon (**Add app**).
   - **Android package name:** `com.kirayasaathi.app` (must be exactly this; it is in `app.json`).
   - App nickname: KirayaSaathi. SHA-1 is not needed for push. Click **Register app**.
3. Click **Download google-services.json**.
4. Put the file in the **project root**, next to `app.json`. `app.json` already points to it
   (`expo.android.googleServicesFile = "./google-services.json"`).
   Keep it in Git (it is not secret and is not in `.gitignore`), otherwise EAS will not see it.
   The build fails if this file is missing or its package name is different.
5. Skip the rest of the Firebase wizard (Gradle steps); Expo does that for you.

## B. Let Expo send through your Firebase project (FCM V1)  [YOU]

1. Firebase console → ⚙ **Project settings** → **Service accounts** tab → **Generate new private key** → download the JSON.
   Keep this file private. **Never commit it.** (In Project settings → **Cloud Messaging**, "Firebase Cloud Messaging API (V1)" must show **Enabled**.)
2. In the project folder run:
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest credentials
   ```
   Choose: **Android** → build profile **preview** (do the same later for **production**) →
   **Google Service Account** → **Manage your Google Service Account Key for Push Notifications (FCM V1)** →
   **Set up a Google Service Account Key for Push Notifications (FCM V1)** → **Upload a new service account key** → pick the JSON from step 1.
3. Done. You can delete the JSON from your computer or keep it somewhere safe.

## C. Supabase  [YOU]

1. **Turn on two extensions:** Supabase → Database → Extensions → enable **pg_net** and **supabase_vault**.
2. **Run the SQL files** in Supabase → SQL Editor, in this order (each is safe to run again):
   `11_free_plan_limits.sql` (if not run yet), `12_app_config.sql`, then do step 3 and 4 below, then `13_push_notifications.sql`, then `14_notices.sql`.
3. **Pick a long random secret** (for example 40 random letters and digits). Store both values in Vault (run once, in the SQL Editor):
   ```sql
   select vault.create_secret('https://zojaedvvdorfsnmwznnr.supabase.co/functions/v1/send-push', 'push_function_url');
   select vault.create_secret('PASTE-YOUR-LONG-RANDOM-SECRET', 'push_webhook_secret');
   ```
4. **Deploy the Edge Function** (needs Node; first time only: `npx supabase login`):
   ```bash
   npx supabase link --project-ref zojaedvvdorfsnmwznnr
   npx supabase secrets set PUSH_WEBHOOK_SECRET=PASTE-THE-SAME-LONG-RANDOM-SECRET
   npx supabase functions deploy send-push --no-verify-jwt
   ```
   `--no-verify-jwt` is right: the function protects itself with the secret header. The secret in `secrets set` and in Vault **must be identical**.

## D. Install the packages and check the code  [YOU]

The new code needs `expo-notifications`. The brief also asked for `expo-location` and `react-native-webview`.
Install them with Expo (never `npm install`), so you get the SDK 58 versions:
```bash
npx expo install expo-notifications expo-location react-native-webview
npx expo lint
npx tsc --noEmit
```
(`expo-image-picker`, `expo-device` and `expo-constants` are already in `package.json`.)

## E. Build a real APK  [YOU]

```bash
npx eas-cli@latest build -p android --profile preview
```
- The package name changed, so EAS will ask to create a **new Android keystore**. Answer **yes** (let EAS generate it).
- The old app (`com.easywebo.ownerapp`) is a different app: owners must install the new APK again.
- Install the APK on a **real phone**. Log in. Tap **Allow** when it asks for notifications.

## F. Test, in this order  [YOU]

1. **Token saved?** Supabase → Table editor → `push_tokens`: one row for your owner.
2. **Plain push:** copy the token, open https://expo.dev/notifications, paste it, add a title and message, send. It must arrive.
   If it does not, read part G.
3. **New lead:** pick a property that is live on RoomIndeed and run in the SQL Editor
   (replace `123` with the property id):
   ```sql
   select public.api_public_enquiry('{"property_id": 123, "name": "Test Person", "phone": "9876543210"}'::jsonb);
   ```
   The owner of that property gets **New lead from KirayaSaathi**, body `Name: Test Person, Number: 9876543210`. Tap it → the lead opens.
   Leads you add inside the app must **not** notify (they have `source = 'app'`).
4. **Notice:**
   ```sql
   select admin_send_notice('Hello', 'This is a test notice.', array['owner@example.com']);
   ```
   Tap the push → the Notices list opens. Owners who missed it can open **More → Notices**.
5. **Three states:** repeat step 3 with the app (a) open, (b) in the background (Home button), (c) closed (swipe it away). Tapping must open `/leads/<id>` every time.
6. **Logout:** log out, send again → nothing arrives on that phone.

## G. If something does not arrive

| Symptom | Check |
|---|---|
| No row in `push_tokens` | Using Expo Go or an emulator without Google Play? Notifications switched off in Android settings? Install the APK, log in again. |
| Row exists, nothing arrives from expo.dev/notifications | FCM key not uploaded (part B). The Expo tool shows an `InvalidCredentials` or `MismatchSenderId` error. Re-upload the service account key; `google-services.json` must be from the same Firebase project and package. |
| Lead saved, no push | `select * from net._http_response order by created desc limit 5;` shows the answer from the Edge Function (401 = the two secrets differ; 404 = function not deployed). Also look at Supabase → Edge Functions → send-push → Logs, and check the warnings in Database → Logs. |
| Push arrives but tap does nothing | Only paths like `/leads/12` or `/notices` are opened. Look at the `data.url` in the message. |
| `DeviceNotRegistered` | The app was uninstalled. The function deletes that token by itself. |

## H. Releasing an update (Step 1: update check)

1. Raise `version` in `app.json` (for example `1.0.3`). EAS raises the Android version code by itself; the **version text is what the app compares**.
2. `npx eas-cli@latest build -p android --profile preview`, then upload the APK somewhere with a direct link.
3. In the SQL Editor:
   ```sql
   -- show a banner on Home ("Update available"):
   select admin_set_app_version('1.0.3', null, 'https://your-link/KirayaSaathi-1.0.3.apk',
          'New version with bug fixes.', 'बग फिक्स के साथ नया वर्शन।');
   -- OR also block old versions completely (full screen, cannot be skipped):
   select admin_set_app_version('1.0.3', '1.0.3', 'https://your-link/KirayaSaathi-1.0.3.apk');
   ```
Owners with the **old** APK (before this check existed) must be told once on WhatsApp to install the new app.

---

## Part E: notification list, on/off switch and big notification (update 15)

1. Supabase > SQL Editor: run `supabase/15_notification_center.sql` once.
2. Big picture in the notification (optional): upload `assets/images/push-banner.png` to a PUBLIC https link
   (for example a public Supabase Storage bucket), then:
       npx supabase secrets set PUSH_IMAGE_URL=https://YOUR-PUBLIC-LINK/push-banner.png
3. Redeploy the function (its code changed):
       npx supabase functions deploy send-push --no-verify-jwt
4. Make a new Android build (the new white notification icon is part of the app file).

Login, link and the secrets are saved on Supabase / your computer: do NOT repeat them for every app build.
