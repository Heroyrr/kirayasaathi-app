# KirayaSaathi: setup

## 1. Database
Supabase > SQL Editor > New query > paste `supabase/schema.sql` > Run.
(Already ran an older version? Run only the missing parts in order: `04_update.sql`, `05_lead_history.sql`, `06_support.sql`, `07_email_admin.sql`, `08_notice_update.sql`, `09_roomindeed_live.sql`, `10_location.sql`, `11_free_plan_limits.sql`.)

## 2. Login with Google (owners sign themselves up, no manual users)
Run `supabase/21_google_signin.sql` once (SQL Editor). A new owner gets a profile and the FREE PLAN (30-day trial: 1 property, 10 units) on the first login.

**a) Google Cloud Console** (https://console.cloud.google.com)
1. Create / pick a project > APIs & Services > OAuth consent screen: User type External, app name KirayaSaathi, your support email. Add scopes `email`, `profile`, `openid`. Click Publish app (otherwise only test users can log in).
2. APIs & Services > Credentials > Create credentials > OAuth client ID > Application type **Web application**.
3. Authorised redirect URI: `https://zojaedvvdorfsnmwznnr.supabase.co/auth/v1/callback`
   (Supabase > Authentication > Sign In / Providers > Google shows the exact URL to copy.)
4. Copy the Client ID and Client Secret.

**b) Supabase** (Authentication)
1. Sign In / Providers > Google: turn ON, paste Client ID and Client Secret, Save.
2. Sign In / Providers: "Allow new users to sign up" must be **ON** (Google sign-up needs it).
3. Email provider: turn it **OFF** (Google is the only login now, so nobody can sign up with a fake email).
4. URL Configuration > Redirect URLs, add:
   - `ownerapp://auth/callback`           (the installed app / APK)
   - `ownerapp:///auth/callback`          (some phones send it with 3 slashes)
   - `exp://**`                          (only for testing in Expo Go, remove later)
   Site URL: `https://kirayasaathi.in` (your own website).
   Only use a website you own: login codes are sent to the Site URL when a return address is not on the list.

**c) App**
    npx expo install expo-web-browser
    npx expo start -c
For an APK: `eas build -p android --profile preview` (the scheme `ownerapp` is already in app.json).

The app has no email / password login any more. Google is the only way in.

## 3. Set the plan after they pay (SQL Editor)
    select admin_set_plan('owner@example.com', 'starter', 'm', 30);   -- plan: basic | starter | growth | pro, cycle: m or y, days
    select admin_set_plan('owner@example.com', 'pro', 'y', 365);
Block / unblock an owner:
    select admin_set_disabled('owner@example.com', true);
Forgot password: Authentication > Users > the owner > send password reset, or set a new password.

## 4. App
    npx expo install expo-file-system        (used to name the invoice PDF, for example invoice-december.pdf)
    npm i @supabase/supabase-js react-native-url-polyfill
    npx expo install @react-native-async-storage/async-storage
Put your Supabase URL, anon key and the team WhatsApp number in `.env` (and in `eas.json` for builds). Then `npx expo start -c`.

## 5. Share an APK
    eas build -p android --profile preview
Share the link it prints.

Prices and limits now live in the `plans` table (run `19_plans_table.sql` once). Change them from the SQL Editor with `admin_upsert_plan(...)`: the app and the limits update together, no app release. `src/utils/plans.ts` is only a fallback.
The old phone OTP login is saved in `later/login-otp.tsx` for when SMS is added.

---

## Later parts (update check, push notifications, notices)

Run in this order after `11_free_plan_limits.sql`: `12_app_config.sql`, `13_push_notifications.sql`, `14_notices.sql` ... `18_partner_branding_live_sites.sql`, then `19_plans_table.sql`.
`13` needs two extensions and two Vault secrets first, and the Edge Function in `supabase/functions/send-push`.
The full steps are in `docs/FIREBASE_PUSH_SETUP.md`.
