/*
| Plans are NOT stored in the app any more. The real list lives in the `plans` table in Supabase
| (supabase/19_plans_table.sql): change prices, limits, wording or add a plan there, no app update needed.
| The app shows exactly the plans that are active in that table. There is no fallback list and no "Custom" card.
| (A private plan for one owner: add it with admin_upsert_plan(..., false) and give it with admin_set_plan.)
*/
export type Bi = { en: string; hi: string }
export type PlanInfo = { id: string; name: string; units: number; properties: number | null; monthly: number; yearly: number; why: Bi; features: Bi[] }

// WhatsApp number of the KirayaSaathi team, with country code and no plus, e.g. 919876543210
// Set EXPO_PUBLIC_SUPPORT_WHATSAPP in .env and in eas.json.
export const SUPPORT_WHATSAPP = (process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '')

// Your website. "Pay" opens WEBSITE_URL/pay?t=... where Razorpay takes the payment (no slash at the end).
// Set EXPO_PUBLIC_WEBSITE_URL in .env and in eas.json.
export const WEBSITE_URL = (process.env.EXPO_PUBLIC_WEBSITE_URL ?? 'https://kirayasaathi.in').replace(/\/+$/, '')
