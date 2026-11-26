# KirayaSaathi: setup

## 1. Database
Supabase > SQL Editor > New query > paste `supabase/schema.sql` > Run.
(Already ran an older version? Run only the missing parts in order: `04_update.sql`, `05_lead_history.sql`, `06_support.sql`, `07_email_admin.sql`, `08_notice_update.sql`, `09_roomindeed_live.sql`, `10_location.sql`, `11_free_plan_limits.sql`.)

## 2. Login settings (Authentication > Sign In / Providers)
- Email: turn ON. "Confirm email" can stay OFF.
- "Allow new users to sign up": turn OFF. Only owners YOU create can log in.

## 3. Create an owner
Authentication > Users > Add user > Create new user: email + password, tick "Auto Confirm User".
Give the owner the email, the password and the app link. On the first login the app creates the owner profile and a 30-day free trial.

## 4. Set the plan after they pay (SQL Editor)
    select admin_set_plan('owner@example.com', 'starter', 'm', 30);   -- plan: basic | starter | growth | pro, cycle: m or y, days
    select admin_set_plan('owner@example.com', 'pro', 'y', 365);
Block / unblock an owner:
    select admin_set_disabled('owner@example.com', true);
Forgot password: Authentication > Users > the owner > send password reset, or set a new password.

## 5. App
    npx expo install expo-file-system        (used to name the invoice PDF, for example invoice-december.pdf)
    npm i @supabase/supabase-js react-native-url-polyfill
    npx expo install @react-native-async-storage/async-storage
Put your Supabase URL, anon key and the team WhatsApp number in `.env` (and in `eas.json` for builds). Then `npx expo start -c`.

## 6. Share an APK
    eas build -p android --profile preview
Share the link it prints.

Prices and limits now live in the `plans` table (run `19_plans_table.sql` once). Change them from the SQL Editor with `admin_upsert_plan(...)`: the app and the limits update together, no app release. `src/utils/plans.ts` is only a fallback.
The old phone OTP login is saved in `later/login-otp.tsx` for when SMS is added.

---

## Later parts (update check, push notifications, notices)

Run in this order after `11_free_plan_limits.sql`: `12_app_config.sql`, `13_push_notifications.sql`, `14_notices.sql` ... `18_partner_branding_live_sites.sql`, then `19_plans_table.sql`.
`13` needs two extensions and two Vault secrets first, and the Edge Function in `supabase/functions/send-push`.
The full steps are in `docs/FIREBASE_PUSH_SETUP.md`.
