/*
| Plans shown in the app. Change the prices here (rupees). The limits (units, properties) are
| enforced by the database, see _limits() in supabase/02_helpers.sql: keep both in step.
| Yearly = 10 months price (2 months free).
*/
export type PlanId = 'basic' | 'starter' | 'growth' | 'pro'
export type PlanInfo = { id: PlanId; name: string; units: number; properties: number | null; monthly: number; yearly: number }

export const PLANS: PlanInfo[] = [
  { id: 'basic', name: 'Basic', units: 10, properties: 1, monthly: 149, yearly: 1490 },
  { id: 'starter', name: 'Starter', units: 25, properties: 2, monthly: 299, yearly: 2990 },
  { id: 'growth', name: 'Growth', units: 60, properties: 5, monthly: 599, yearly: 5990 },
  { id: 'pro', name: 'Pro', units: 150, properties: null, monthly: 999, yearly: 9990 },
]

// WhatsApp number of the KirayaSaathi team, with country code and no plus, e.g. 919876543210
// Set EXPO_PUBLIC_SUPPORT_WHATSAPP in .env and in eas.json.
export const SUPPORT_WHATSAPP = (process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '')
