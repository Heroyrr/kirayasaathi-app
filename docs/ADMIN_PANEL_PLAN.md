# Website and admin panel (plan, built later)

The app was prepared for these:

- One Supabase project is shared by the app, the website and the admin panel.
- Owners are Supabase Auth users (email + password). The app profile is the `users` table (created on first login).
- Admin panel (admin.yourdomain.com, Next.js, runs on the server): uses the **service_role key** (never in the app or the browser) to:
  - create an owner:            supabase.auth.admin.createUser({ email, password, email_confirm: true })
  - reset a password:           supabase.auth.admin.updateUserById(id, { password })
  - set a plan:                 call admin_set_plan(email, plan, cycle, days)   (or update `subscriptions`)
  - block / unblock:            call admin_set_disabled(email, true|false)   (a blocked owner gets "account turned off")
  - see an owner's data:        read tables `properties`, `rooms`, `bookings`, `tenants`, `invoices`, `payments`, `leads`, `complaints` with the service role
- Log in to the admin panel with your own Supabase admin user (mark it with app_metadata.role = 'admin' and check that on the server).
- Website (marketing): static Next.js pages: home, features, pricing (same numbers as `src/utils/plans.ts`), about, contact, privacy, terms, APK download link.
- Add later: Razorpay + OTP login. Nothing in the data model has to change.
