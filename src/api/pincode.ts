/**
 * Pincode -> state, city and the post office areas (free, no key).
 * Source: https://api.postalpincode.in  (a free public mirror of India Post data).
 * It is a community service, so it can be slow or down: the screen lets the owner type everything by hand too.
 */
export type PinInfo = { state: string; city: string; cities: string[]; localities: string[] }

type PostOffice = { Name?: string; District?: string; Block?: string; State?: string }

export async function lookupPincode(pin: string): Promise<PinInfo | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`pincode ${res.status}`)
    const json = (await res.json()) as { Status?: string; PostOffice?: PostOffice[] | null }[]
    const d = Array.isArray(json) ? json[0] : undefined
    const offices = d?.Status === 'Success' && Array.isArray(d.PostOffice) ? d.PostOffice : []
    if (offices.length === 0) return null // the pincode does not exist
    const first = offices[0]
    const uniq = (list: (string | undefined)[]) => [...new Set(list.map((x) => (x ?? '').trim()).filter((x) => x && x.toUpperCase() !== 'NA'))]
    // district first (this is the city), then the block / town names
    const cities = uniq([...offices.map((o) => o.District), ...offices.map((o) => o.Block)])
    const names = offices.map((o) => (o.Name ?? '').trim()).filter(Boolean)
    return {
      state: (first.State ?? '').trim(),
      city: cities[0] ?? '',
      cities,
      // "Golghar S.O" -> "Golghar": the post office type is not part of the area name
      localities: [...new Set(names.map((n) => n.replace(/\s+(H\.?O|S\.?O|B\.?O|G\.?P\.?O)\.?$/i, '').trim()).filter(Boolean))].sort(),
    }
  } finally {
    clearTimeout(timer)
  }
}
