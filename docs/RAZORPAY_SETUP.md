# Razorpay setup for KirayaSaathi (step by step)

Flow: **App > Plans > Pay** -> website `/pay?t=...` -> Razorpay Checkout -> payment verified on the server -> Supabase plan extended -> owner returns to the app.
The price always comes from the `plans` table in Supabase. The app can never choose the amount.

---------------------------------------------------------------
## PART A. Open and verify your Razorpay account
---------------------------------------------------------------
1. Go to https://razorpay.com > **Sign Up**. Use your business email and mobile number, verify the OTP.
2. You start in **Test Mode** (toggle at the top of the dashboard). Everything in Part B-E can be tested with fake money first.
3. To receive REAL money, complete **Account & Settings > Activate your account** (KYC):
   - Business type: pick what you are legally: Individual / Proprietorship / Pvt Ltd. A solo person can use **Individual or Proprietorship**.
   - Business details: business name (KirayaSaathi), category **Software / SaaS**, website `https://kirayasaathi.in`, short description of what you sell (monthly/yearly subscription of a property management app).
   - Documents: your PAN (individual or business), address proof, and a bank account in the same name (cancelled cheque or bank statement).
   - Bank account: where Razorpay will send your money (settlements).
4. Razorpay reviews the website. **Before you submit, make sure your website has**: Privacy Policy, Terms and Conditions, **Refund / Cancellation Policy**, Contact page (email + phone), and visible plan prices. Razorpay rejects sites without a refund policy. Your site already has `/privacy`, `/terms` and `/contact`: add a `/refund` page (a few lines: for example "subscription fee is non-refundable except if we charged you twice, in which case we refund in 5-7 working days") and link it in the footer. Have the text checked by someone who knows the law.
5. Approval usually takes 1-3 working days. You get an email when the account is **Activated**.

---------------------------------------------------------------
## PART B. Get the API keys
---------------------------------------------------------------
1. Dashboard > **Account & Settings > API Keys** (under Website and app settings).
2. Make sure the toggle says **Test Mode** > click **Generate Test Key**. You get:
   - **Key Id**: `rzp_test_xxxxxxxx`  (not secret)
   - **Key Secret**: shown ONLY ONCE. Copy it now. If you lose it, regenerate (the old one stops working).
3. After activation, switch to **Live Mode** and generate the **Live Key** the same way (`rzp_live_...`).
4. Never put the Key Secret in the app, in GitHub, or in any `NEXT_PUBLIC_` variable.

---------------------------------------------------------------
## PART C. Run the SQL in Supabase
---------------------------------------------------------------
1. Supabase > **SQL Editor > New query**. Paste the full file `supabase/22_razorpay_payments.sql` > **Run**. (Safe to run again. Parts 19 and 20 must already be run.)
2. It creates the `plan_orders` table (every payment attempt) and two functions:
   - `api_plan_checkout` : the app calls it to get a one-time pay link
   - `plan_order_paid`  : only your website server can call it, after the payment is verified
3. Check your plans: `select id, name, monthly, yearly, active from plans order by sort;`
   Only rows with `active = true` and `monthly > 0` show in the app. To change a price or add a plan, use `admin_upsert_plan(...)` (see the comments inside `19_plans_table.sql`). No app update needed.

---------------------------------------------------------------
## PART D. Website: add the secrets and deploy
---------------------------------------------------------------
You need 4 secret values:

| Name | Where to get it |
|---|---|
| `RAZORPAY_KEY_ID` | Part B (Test first: `rzp_test_...`) |
| `RAZORPAY_KEY_SECRET` | Part B (shown once) |
| `RAZORPAY_WEBHOOK_SECRET` | You make up a long random text in Part E (any 20+ characters) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Project Settings > API > **service_role** (secret). It can do everything: keep it server-only |

**Local test:** put them in `.env.local` (already has empty lines for them) and run `npm run dev`.

**Production on Cloudflare (your website runs there):**
- Cloudflare dashboard > Workers & Pages > your worker `kirayasaathi` > **Settings > Variables and Secrets** > Add each of the 4 names as type **Secret**.
- Or from the terminal in the website folder:
  ```
  npx wrangler secret put RAZORPAY_KEY_ID
  npx wrangler secret put RAZORPAY_KEY_SECRET
  npx wrangler secret put RAZORPAY_WEBHOOK_SECRET
  npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
  ```
- Then deploy: `npm run deploy`.
- Also keep `NEXT_PUBLIC_SITE_URL=https://kirayasaathi.in` as it is.

---------------------------------------------------------------
## PART E. Create the webhook (the safety net)
---------------------------------------------------------------
The webhook makes sure the plan is activated even if the owner closes the browser right after paying.
1. Razorpay > **Account & Settings > Webhooks > Add New Webhook** (do this in Test Mode first, then again in Live Mode: they are separate).
2. **Webhook URL:** `https://kirayasaathi.in/api/razorpay/webhook`
3. **Secret:** type your random text. It must be exactly the same as `RAZORPAY_WEBHOOK_SECRET` in Part D.
4. **Active events:** tick **payment.captured** and **order.paid**.
5. Save. (If you change the secret later, change it in Cloudflare too and redeploy.)

---------------------------------------------------------------
## PART F. Auto-capture (important)
---------------------------------------------------------------
Dashboard > **Account & Settings > Payment Capture** (or Payment Settings) > set to **Automatically capture payments**. Otherwise payments stay "authorized" and are refunded after 5 days.

---------------------------------------------------------------
## PART G. App
---------------------------------------------------------------
1. Nothing to install: no new package is needed.
2. `.env` / `eas.json`: `EXPO_PUBLIC_WEBSITE_URL=https://kirayasaathi.in` (already added in `eas.json` and `.env.example`).
3. Build a new APK as usual and upload it to GitHub release like your normal update (do not forget to raise the version for the in-app update check).

---------------------------------------------------------------
## PART H. Test it (in Test Mode) before going live
---------------------------------------------------------------
1. App > Plans: you see only your database plans, with a Monthly / Yearly switch.
2. Tap **Pay**. The browser opens `https://kirayasaathi.in/pay?t=...`. Tap **Pay now**.
3. Test payments:
   - Card: `4111 1111 1111 1111`, any future expiry, any CVV, any OTP.
   - UPI: `success@razorpay` (success) or `failure@razorpay` (failure).
4. After success the page says "Payment received". Tap **Open the app**: the plan updates. Check in SQL:
   `select * from subscriptions where user_id = <id>;` and
   `select * from plan_orders order by created_at desc limit 5;` (status should be `paid`).
5. Webhook check: Razorpay > Webhooks > your webhook > **Logs**: should show `200`.
6. When all works: switch Razorpay to Live Mode, generate Live keys, replace `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in Cloudflare with the live ones, create the Live webhook (Part E), redeploy. Make one small real payment yourself (for example a Basic plan) and then refund it from the Razorpay dashboard.

---------------------------------------------------------------
## How it behaves
---------------------------------------------------------------
- **Renewal:** same plan still running -> the new period is added AFTER the current end date (no days lost). Monthly = 30 days, yearly = 365 days.
- **Free trial or a different plan:** the new period starts now (remaining trial/old plan days are not added). If you want to be generous, change `v_start` in `plan_order_paid`.
- **Expired plan:** after payment the properties that were taken offline come back online automatically (part 20 trigger).
- **Too small plan:** if an owner uses more units/properties than a plan allows, that plan's Pay button is disabled (and the database also refuses).
- **Pay link:** valid 2 hours, one link per tap. A payment that arrives late is still accepted.
- **Safety:** the browser is never trusted. The server checks Razorpay's signature (and the webhook signature) before it extends any plan. Card/UPI details never touch your server.
- **Refunds:** do them in the Razorpay dashboard. The plan is NOT reduced automatically: change it with `admin_set_plan(...)` if needed.
- **GST:** prices are shown as entered. If you are GST registered, decide whether prices include GST. Razorpay does not create GST invoices for you.
- **Money reports:** `select sum(amount_paise)/100 from plan_orders where status='paid';`
