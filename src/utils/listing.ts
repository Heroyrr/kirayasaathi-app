import type { LiveSite, Property } from '../api/types'

type Lang = 'en' | 'hi'
type Item = { key: string; en: string; hi: string }

/** Must match the list in supabase/09_roomindeed_live.sql (api_update_listing) */
export const AMENITIES: Item[] = [
  { key: 'ac', en: 'AC', hi: 'एसी' },
  { key: 'car_parking', en: 'Car parking', hi: 'कार पार्किंग' },
  { key: 'bike_parking', en: 'Bike parking', hi: 'बाइक पार्किंग' },
  { key: 'bed', en: 'Bed', hi: 'बेड' },
  { key: 'mattress', en: 'Mattress', hi: 'गद्दा' },
  { key: 'wifi', en: 'WiFi', hi: 'वाईफाई' },
  { key: 'geyser', en: 'Geyser', hi: 'गीजर' },
  { key: 'fridge', en: 'Fridge', hi: 'फ्रिज' },
  { key: 'tv', en: 'TV', hi: 'टीवी' },
  { key: 'washing_machine', en: 'Washing machine', hi: 'वॉशिंग मशीन' },
  { key: 'wardrobe', en: 'Wardrobe', hi: 'अलमारी' },
  { key: 'power_backup', en: 'Power backup', hi: 'पावर बैकअप' },
  { key: 'lift', en: 'Lift', hi: 'लिफ्ट' },
  { key: 'cctv', en: 'CCTV', hi: 'सीसीटीवी' },
  { key: 'meals', en: 'Meals', hi: 'खाना' },
  { key: 'housekeeping', en: 'Housekeeping', hi: 'सफाई सेवा' },
  { key: 'attached_bath', en: 'Attached bathroom', hi: 'अटैच बाथरूम' },
  { key: 'balcony', en: 'Balcony', hi: 'बालकनी' },
  { key: 'ro_water', en: 'RO water', hi: 'आरओ पानी' },
]

/** Bed property (PG / Hostel) -> Hostel, PG. Non-bed property -> Private room, 1RK, 1BHK, 2BHK, 3BHK */
export const UNIT_TYPES: Record<Property['type'], Item[]> = {
  BED: [
    { key: 'hostel', en: 'Hostel', hi: 'हॉस्टल' },
    { key: 'pg', en: 'PG', hi: 'पीजी' },
  ],
  NON_BED: [
    { key: 'private_room', en: 'Private room', hi: 'प्राइवेट रूम' },
    { key: '1rk', en: '1 RK', hi: '1 आरके' },
    { key: '1bhk', en: '1 BHK', hi: '1 बीएचके' },
    { key: '2bhk', en: '2 BHK', hi: '2 बीएचके' },
    { key: '3bhk', en: '3 BHK', hi: '3 बीएचके' },
  ],
}

const ALL: Item[] = [...AMENITIES, ...UNIT_TYPES.BED, ...UNIT_TYPES.NON_BED]
export const listingLabel = (key: string, lang: Lang) => {
  const it = ALL.find((a) => a.key === key)
  return it ? it[lang] : key
}

export type LocationForm = {
  pincode: string; state: string; city: string; locality: string; address: string; landmark: string
  lat: number | null; lng: number | null
}
export const EMPTY_LOCATION: LocationForm = { pincode: '', state: '', city: '', locality: '', address: '', landmark: '', lat: null, lng: null }

/** Indian pincode: 6 digits, the first one is not 0 */
export const isPincode = (s: string) => /^[1-9][0-9]{5}$/.test(s.trim())

/** Step 1: what is still missing in the details. Same rules as the database (_listing_problem). */
export function detailsMissing(f: { photos: number; rent: string; deposit: string; types: number; units: number }): string[] {
  const out: string[] = []
  const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s))
  if (f.photos < 1) out.push('photos')
  const r = num(f.rent)
  if (r === null || r <= 0) out.push('rent')
  const d = num(f.deposit)
  if (d === null || d < 0) out.push('deposit')
  if (f.types < 1) out.push('types')
  if (f.units < 1) out.push('units')
  return out
}

/** Step 2: what is still missing in the location */
export function locationMissing(l: LocationForm): string[] {
  const out: string[] = []
  if (!isPincode(l.pincode)) out.push('pincode')
  if (l.city.trim() === '') out.push('city')
  if (l.locality.trim() === '') out.push('locality')
  if (l.address.trim() === '') out.push('address')
  if (l.lat == null || l.lng == null) out.push('pin')
  return out
}

/** Everything, used when a property that is already live is saved */
export const listingMissing = (
  f: { photos: number; rent: string; deposit: string; types: number; units: number },
  l: LocationForm,
): string[] => [...detailsMissing(f), ...locationMissing(l)]

/** The location as the body of the save call (text is trimmed, an empty pin is sent as null) */
export const locationBody = (l: LocationForm) => ({
  address: l.address.trim(),
  pincode: l.pincode.trim(),
  state: l.state.trim(),
  city: l.city.trim(),
  locality: l.locality.trim(),
  landmark: l.landmark.trim(),
  lat: l.lat ?? null,
  lng: l.lng ?? null,
})

/** "Golghar, Gorakhpur - 273001" */
export const placeLine = (l: Pick<LocationForm, 'locality' | 'city' | 'pincode'>) =>
  [l.locality.trim(), l.city.trim()].filter(Boolean).join(', ') + (l.pincode.trim() ? ` - ${l.pincode.trim()}` : '')

/** "Sunrise PG" or "Sunrise PG +2 more" */
export const propertyNames = (list: { name: string }[] | undefined | null, more: (n: number) => string) => {
  if (!list || list.length === 0) return ''
  return list.length === 1 ? list[0].name : `${list[0].name} ${more(list.length - 1)}`
}

/** "GharSaathi", "GharSaathi and RoomIndeed", "GharSaathi, RoomIndeed and RoomWala" */
export const siteNames = (sites: LiveSite[] | undefined | null, and: string) => {
  const names = (sites ?? []).map((x) => x.name)
  if (names.length === 0) return 'GharSaathi'
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`
}

/** The address "See live" opens. {q} = property name, {id} = property id. null = no website address saved yet. */
export const siteUrl = (site: LiveSite, propertyName: string, propertyId?: number) =>
  site.url_template
    ? site.url_template.replace('{q}', encodeURIComponent(propertyName.trim())).replace('{id}', propertyId != null ? String(propertyId) : '')
    : null
