# KirayaSaathi: setup

## 1. Database
Supabase > SQL Editor > New query > paste `supabase/schema.sql` > Run.
(Already ran an older version? Run only the missing parts in order: `04_update.sql`, `05_lead_history.sql`, `06_support.sql`, `07_email_admin.sql`, `08_notice_update.sql`.)

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

Prices and limits: `src/utils/plans.ts` (shown in the app) and `_limits()` in `supabase/02_helpers.sql` (enforced). Keep them in step.
The old phone OTP login is saved in `later/login-otp.tsx` for when SMS is added.
