const pad = (n: number) => String(n).padStart(2, '0')

/** Date -> "2026-11-03" in the phone's own time zone (the server expects this format) */
export const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** "2026-11-03" -> Date at local midnight */
export const fromYmd = (s?: string | null) => {
  if (!s) return new Date() // a missing date means today instead of a crash
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export const todayYmd = () => toYmd(new Date())

export const addDays = (ymd: string, days: number) => {
  const d = fromYmd(ymd)
  d.setDate(d.getDate() + days)
  return toYmd(d)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-11-03" -> "03 Nov 2026" */
export const showDate = (ymd?: string | null) => {
  if (!ymd) return '—'
  const d = fromYmd(ymd)
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "2026-11-05" -> "2026-12-04" (one month later, minus a day: a normal rent period) */
export const monthPeriodEnd = (ymd: string) => {
  const d = fromYmd(ymd)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate())
  end.setDate(end.getDate() - 1)
  return toYmd(end)
}

export const currentMonth = () => todayYmd().slice(0, 7)

/** "2026-11" shifted by n months */
export const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** "2026-11" -> "Nov 2026" */
export const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

/** Rent period for a chosen month: starts on the same day of the month as the stay started (12 Nov to 11 Dec), ends a month later minus a day */
export const periodForMonth = (ym: string, anchorYmd?: string) => {
  const [y, m] = ym.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const day = Math.min(anchorYmd ? fromYmd(anchorYmd).getDate() : 1, daysInMonth)
  const start = `${y}-${pad(m)}-${pad(day)}`
  return { start, end: monthPeriodEnd(start) }
}

/** whole days from today to a date (negative = the date has passed) */
export const daysFromToday = (ymd: string) => {
  const t = fromYmd(todayYmd()).getTime()
  return Math.round((fromYmd(ymd).getTime() - t) / 86400000)
}

/** number of days from a start to an end date, both days counted: 16 Nov to 30 Nov = 15 */
export const daysInPeriod = (startYmd: string, endYmd: string) =>
  Math.round((fromYmd(endYmd).getTime() - fromYmd(startYmd).getTime()) / 86400000) + 1

/** rent is split over 30 days for a part of a month: monthly rent / 30 x days */
export const PRORATE_DAYS = 30

/**
 * Rent for the chosen invoice period.
 * A normal rent month (12 Nov to 11 Dec, 1 Feb to 28 Feb) is the full monthly rent.
 * Any other period is monthly rent / 30 x days, for example 8000 / 30 x 14 = 3733.
 */
export const prorateRent = (monthly: number, startYmd: string, endYmd: string) => {
  const days = daysInPeriod(startYmd, endYmd)
  if (days <= 0 || endYmd === monthPeriodEnd(startYmd)) return { amount: monthly, days: Math.max(days, 0), full: true }
  return { amount: Math.round((monthly / PRORATE_DAYS) * days), days, full: false }
}
