/*
| Plans shown in the app. Change the prices here (rupees). The limits (units, properties) are
| enforced by the database, see _limits() in supabase/schema.sql (and 11_free_plan_limits.sql): keep both in step.
| The free trial is 1 property and 10 units.
| Yearly = 10 months price (2 months free).
*/
export type PlanId = 'basic' | 'starter' | 'growth' | 'pro'
export type Bi = { en: string; hi: string }
export type PlanInfo = { id: PlanId; name: string; units: number; properties: number | null; monthly: number; yearly: number; why: Bi; features: Bi[] }

// What the owner gets. Edit the wording or the lists here.
const F = {
  leads: { en: 'Leads: add, follow up, talk history', hi: 'लीड: जोड़ें, फॉलो-अप, बातचीत का इतिहास' },
  ekyc: { en: 'Tenant e-KYC', hi: 'किरायेदार e-KYC' },
  invoice: { en: 'Invoice and receipt share (WhatsApp / PDF)', hi: 'इनवॉइस और रसीद शेयर (WhatsApp / PDF)' },
  payments: { en: 'Rent, payments and balance tracking', hi: 'किराया, भुगतान और बैलेंस ट्रैकिंग' },
  meters: { en: 'Electricity meters and readings', hi: 'बिजली मीटर और रीडिंग' },
  support: { en: 'Tenant complaints / support', hi: 'किरायेदार की शिकायतें / सहायता' },
  live: { en: 'RoomIndeed live listing (get enquiries)', hi: 'RoomIndeed लाइव लिस्टिंग (पूछताछ पाएं)' },
  priority: { en: 'Priority support', hi: 'प्राथमिकता सहायता' },
}
const BASE = [F.leads, F.ekyc, F.invoice, F.payments]

export const PLANS: PlanInfo[] = [
  { id: 'basic', name: 'Basic', units: 10, properties: 1, monthly: 149, yearly: 1490,
    why: { en: 'Best for a single small property.', hi: 'एक छोटी प्रॉपर्टी के लिए सबसे अच्छा।' }, features: [...BASE] },
  { id: 'starter', name: 'Starter', units: 25, properties: 2, monthly: 299, yearly: 2990,
    why: { en: 'Manage two properties and fill vacant rooms through RoomIndeed.', hi: 'दो प्रॉपर्टी संभालें और RoomIndeed से खाली कमरे भरें।' }, features: [...BASE, F.meters, F.live] },
  { id: 'growth', name: 'Growth', units: 60, properties: 5, monthly: 599, yearly: 5990,
    why: { en: 'For growing owners: more rooms, complaints and meters in one place.', hi: 'बढ़ते मालिकों के लिए: ज़्यादा कमरे, शिकायतें और मीटर एक जगह।' }, features: [...BASE, F.meters, F.support, F.live] },
  { id: 'pro', name: 'Pro', units: 150, properties: null, monthly: 999, yearly: 9990,
    why: { en: 'For large businesses: unlimited properties and priority help.', hi: 'बड़े कारोबार के लिए: असीमित प्रॉपर्टी और प्राथमिकता सहायता।' }, features: [...BASE, F.meters, F.support, F.live, F.priority] },
]

// WhatsApp number of the KirayaSaathi team, with country code and no plus, e.g. 919876543210
// Set EXPO_PUBLIC_SUPPORT_WHATSAPP in .env and in eas.json.
export const SUPPORT_WHATSAPP = (process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '')

/** The customised plan. The price is agreed with the team, so it is not fixed here. */
export const CUSTOM_PLAN = {
  name: 'Custom',
  price: 'X',
  why: { en: 'Need more than Pro, or only some features? We build a plan for you.', hi: 'Pro से ज़्यादा चाहिए या कुछ ही फीचर? हम आपके लिए प्लान बनाते हैं।' } as Bi,
  features: [
    { en: 'Increase units (more than 150)', hi: 'यूनिट बढ़ाएं (150 से ज़्यादा)' },
    { en: 'Increase properties', hi: 'प्रॉपर्टी बढ़ाएं' },
    { en: 'Pick only the features you need', hi: 'सिर्फ़ ज़रूरी फीचर चुनें' },
    { en: 'Extra staff / logins', hi: 'अतिरिक्त स्टाफ / लॉगिन' },
    { en: 'Price is set by you and the team (₹X per month)', hi: 'कीमत आप और टीम तय करते हैं (₹X प्रति माह)' },
  ] as Bi[],
}
