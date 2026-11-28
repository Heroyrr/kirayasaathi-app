/*
| One place that talks to the backend. The backend is now Supabase.
|
| The screens and the store/api files still call api('/properties'), api('/bookings/5/move-out') and so on,
| so none of them had to change. This file turns each of those calls into a Supabase call:
|   - login            -> Supabase phone OTP
|   - everything else  -> one api_* database function (the money rules live in the database)
|   - files            -> private Supabase Storage bucket "files"
| Every failure becomes an ApiError with message, status and code, like before.
*/
import { Platform } from 'react-native'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { supabase } from './supabase'
import { base64ToBytes } from '../utils/base64'
import { dropBase64, takeBase64 } from '../utils/pickImage'

let onUnauthorized: (() => void) | null = null

export const setToken = (_t: string | null) => { /* Supabase keeps the login session itself */ }
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn }
export const apiBase = () => process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''

export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type Query = Record<string, string | number | boolean | undefined | null>
type Opts = { method?: string; body?: unknown; query?: Query; form?: FormData; auth?: boolean }

/* ------------------------------------------------------------------ test login (development) */
// Test owner for development. It logs in WITHOUT any SMS provider (a hidden email + password account is used).
// The OTP is only checked here in the app. To switch it off, set EXPO_PUBLIC_TEST_PHONE= (empty) in .env.
// Switched off by default: all three EXPO_PUBLIC_TEST_* values are empty (also in eas.json).
const TEST_PHONE = process.env.EXPO_PUBLIC_TEST_PHONE ?? ''
const TEST_OTP = process.env.EXPO_PUBLIC_TEST_OTP ?? ''
const TEST_PASSWORD = process.env.EXPO_PUBLIC_TEST_PASSWORD ?? ''
// Supabase only accepts email domains that have real mail servers. No email is ever sent (Confirm email is off).
const TEST_EMAIL_DOMAIN = process.env.EXPO_PUBLIC_TEST_EMAIL_DOMAIN ?? 'gmail.com'
const testEmail = (digits: string) => `owner.test.${digits}@${TEST_EMAIL_DOMAIN}`
const isTest = (digits: string) => !!TEST_PHONE && !!TEST_OTP && digits === TEST_PHONE

/* ------------------------------------------------------------------ errors */
type PgErr = { message?: string; details?: string | null; hint?: string | null; code?: string }

function fail(err: PgErr, status: number, auth: boolean): ApiError {
  const message = err.message ?? 'Request failed'
  let httpStatus = status
  let code: string | undefined

  if (err.code === 'P0001' && err.details) {
    // our own database rules: details = error code, hint = http status
    code = String(err.details)
    httpStatus = Number(err.hint) || 422
  } else if (status === 0 || /network request failed|failed to fetch|network error/i.test(message)) {
    return new ApiError('Cannot reach the server', 0, 'NETWORK')
  } else if (err.code === 'PGRST301' || err.code === 'PGRST303' || status === 401 || /jwt/i.test(message)) {
    httpStatus = 401
    code = 'UNAUTH'
  } else if (err.code === '42501') {
    httpStatus = 403
  }
  if (httpStatus === 401 && auth) onUnauthorized?.()
  return new ApiError(message, httpStatus || 500, code)
}

function authFail(err: { message: string; status?: number; code?: string }, step: 'send' | 'verify'): ApiError {
  const status = err.status ?? 0
  if (status === 0 || /network request failed|failed to fetch|retryable/i.test(err.message)) {
    return new ApiError('Cannot reach the server', 0, 'NETWORK')
  }
  if (err.code === 'over_sms_send_rate_limit' || err.code === 'over_request_rate_limit' || status === 429) {
    return new ApiError(err.message, 429, 'OTP_TOO_SOON')
  }
  if (step === 'verify' && (err.code === 'otp_expired' || err.code === 'validation_failed' || /expired|invalid/i.test(err.message))) {
    return new ApiError(err.message, 400, 'OTP_INVALID')
  }
  return new ApiError(err.message, status || 400)
}

const timeout = <T,>(p: PromiseLike<T>, ms = 20000): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const h = setTimeout(() => reject(new ApiError('Cannot reach the server', 0, 'NETWORK')), ms)
    Promise.resolve(p).then(
      (v) => { clearTimeout(h); resolve(v) },
      (e) => { clearTimeout(h); reject(e) }
    )
  })

/** Calls one api_* function in the database. It always receives a single json argument "p". */
async function rpc<T = any>(fn: string, p: Record<string, unknown> = {}, auth = true): Promise<T> {
  const res = await timeout(supabase.rpc(fn, { p } as any))
  if (res.error) throw fail(res.error as PgErr, res.status, auth)
  return res.data as T
}

/* ------------------------------------------------------------------ login */
const cleanDigits = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-10)
const e164 = (digits: string) => `+91${digits}`

async function sendOtp(body: any) {
  const digits = cleanDigits(body?.phone)
  if (isTest(digits)) return { is_new: false, dev_otp: TEST_OTP } // no SMS for the test number
  const status = await rpc<{ exists: boolean }>('api_phone_status', { phone: digits }, false)
  const { error } = await timeout(supabase.auth.signInWithOtp({ phone: e164(digits) }))
  if (error) throw authFail(error, 'send')
  return { is_new: !status.exists }
}

// Test number only: check the OTP here, then sign in with the hidden test account (created on first use)
async function verifyTest(digits: string, otp: string) {
  if (otp !== TEST_OTP) throw new ApiError('Wrong OTP', 400, 'OTP_INVALID')
  const email = testEmail(digits)
  let res = await timeout(supabase.auth.signInWithPassword({ email, password: TEST_PASSWORD }))
  if (res.error || !res.data.session) {
    const first = res.error?.message ?? 'Login failed'
    const up = await timeout(supabase.auth.signUp({ email, password: TEST_PASSWORD }))
    if (up.error) {
      // the user exists but the sign in failed: show the real reason
      if (/already registered|already been registered/i.test(up.error.message)) {
        throw new ApiError(`Test login failed (${first}). In Supabase > Authentication > Users set the password of ${email} to ${TEST_PASSWORD} and make sure the user is confirmed.`, 400)
      }
      throw new ApiError(up.error.message, up.error.status ?? 400)
    }
    if (!up.data.session) {
      throw new ApiError('Test login: in Supabase turn OFF "Confirm email" (Authentication > Sign In / Providers > Email), then try again.', 400)
    }
    res = await timeout(supabase.auth.signInWithPassword({ email, password: TEST_PASSWORD }))
    if (res.error || !res.data.session) throw authFail(res.error ?? { message: 'Login failed' }, 'verify')
  }
  return res.data.session
}

async function verifyOtp(body: any) {
  const digits = cleanDigits(body?.phone)
  let session
  if (isTest(digits)) {
    session = await verifyTest(digits, String(body?.otp ?? ''))
  } else {
    const { data, error } = await timeout(
      supabase.auth.verifyOtp({ phone: e164(digits), token: String(body?.otp ?? ''), type: 'sms' })
    )
    if (error || !data.session) throw authFail(error ?? { message: 'Invalid OTP' }, 'verify')
    session = data.session
  }
  try {
    // creates the owner and the 30-day free trial the first time
    const boot = await rpc<{ user: unknown; subscription: unknown }>('api_bootstrap', body?.name ? { name: body.name } : {})
    return { token: session.access_token, user: boot.user, subscription: boot.subscription }
  } catch (e) {
    await supabase.auth.signOut().catch(() => {})
    throw e
  }
}

/** Google sign-in. Opens Google in the phone's browser; Supabase brings the owner back to the app with a one-time code.
 *  The first time, api_bootstrap makes the owner profile and the free plan (30-day trial). */
async function loginGoogle() {
  const redirectTo = Platform.OS === 'web' ? `${window.location.origin}/auth/callback` : Linking.createURL('auth/callback')
  const start = await timeout(
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
    })
  )
  if (start.error || !start.data?.url) throw authFail(start.error ?? { message: 'Google sign-in could not start' }, 'send')

  // no timeout here: the owner may take a while to pick an account
  const result = await WebBrowser.openAuthSessionAsync(start.data.url, redirectTo)
  if (result.type !== 'success' || !result.url) throw new ApiError('Google sign-in cancelled', 0, 'GOOGLE_CANCELLED')

  const back = new URL(result.url)
  const hash = new URLSearchParams(back.hash.replace(/^#/, ''))
  const reason = back.searchParams.get('error_description') ?? hash.get('error_description')
  if (reason) throw new ApiError(reason.replace(/\+/g, ' '), 400, 'GOOGLE_FAILED')
  const code = back.searchParams.get('code')
  if (!code) throw new ApiError('Google sign-in failed. Please try again.', 400, 'GOOGLE_FAILED')

  return finishGoogle(code)
}

// A one-time code can be used only once. The login screen and the callback screen can both see it,
// so the first caller does the work and the second one gets the same result.
const exchanging = new Map<string, Promise<{ token: string; user: unknown; subscription: unknown }>>()
function finishGoogle(code: string) {
  let job = exchanging.get(code)
  if (!job) {
    job = (async () => {
      const { data, error } = await timeout(supabase.auth.exchangeCodeForSession(code))
      if (error || !data.session) throw authFail(error ?? { message: 'Google sign-in failed' }, 'verify')
      try {
        const boot = await rpc<{ user: unknown; subscription: unknown }>('api_bootstrap', {})
        return { token: data.session.access_token, user: boot.user, subscription: boot.subscription }
      } catch (err) {
        await supabase.auth.signOut().catch(() => {}) // e.g. ACCOUNT_DISABLED
        throw err
      }
    })()
    exchanging.set(code, job)
  }
  return job
}

async function requireSession() {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new ApiError('Please log in again.', 401, 'UNAUTH')
  return data.session
}

/* ------------------------------------------------------------------ private files */
const EXT: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }

async function uploadFile(body: { uri: string; kind: string; mime?: string }) {
  const session = await requireSession()
  const mime = body.mime ?? 'image/jpeg'
  const kind = String(body.kind ?? 'file').replace(/[^a-z0-9_]/gi, '').toLowerCase() || 'file'
  // the first folder must be the owner's id: the storage rules only let an owner touch their own folder
  const key = `${session.user.id}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${EXT[mime] ?? 'jpg'}`

  const b64 = takeBase64(body.uri)
  let bytes: Uint8Array
  try {
    bytes = b64 ? base64ToBytes(b64) : new Uint8Array(await (await fetch(body.uri)).arrayBuffer())
  } catch {
    throw new ApiError('Could not read the photo. Please pick it again.', 0, 'E_VALIDATION')
  }
  const { error } = await timeout(
    supabase.storage.from('files').upload(key, bytes.buffer as ArrayBuffer, { contentType: mime, upsert: false }),
    60000
  )
  if (error) throw new ApiError(error.message, 400)
  dropBase64(body.uri)
  return { key, mime_type: mime, size: bytes.byteLength }
}

// listing photos: public bucket "listings", first folder = owner id (the storage rules check it)
async function uploadListingPhoto(body: { uri: string; mime?: string }) {
  const session = await requireSession()
  const mime = body.mime ?? 'image/jpeg'
  const key = `${session.user.id}/listing/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${EXT[mime] ?? 'jpg'}`
  const b64 = takeBase64(body.uri)
  let bytes: Uint8Array
  try {
    bytes = b64 ? base64ToBytes(b64) : new Uint8Array(await (await fetch(body.uri)).arrayBuffer())
  } catch {
    throw new ApiError('Could not read the photo. Please pick it again.', 0, 'E_VALIDATION')
  }
  const { error } = await timeout(
    supabase.storage.from('listings').upload(key, bytes.buffer as ArrayBuffer, { contentType: mime, upsert: false }),
    60000
  )
  if (error) throw new ApiError(error.message, 400)
  dropBase64(body.uri)
  return { key, url: listingPhotoUrl(key) }
}

/** public address of a listing photo (the same address the RoomIndeed website uses) */
export const listingPhotoUrl = (key: string) => `${apiBase()}/storage/v1/object/public/listings/${key}`

async function fileLink(query: Query) {
  await requireSession()
  const { data, error } = await timeout(supabase.storage.from('files').createSignedUrl(String(query.key ?? ''), 600))
  if (error || !data) throw new ApiError(error?.message ?? 'File not found', 404, 'E_NOT_FOUND')
  return { url: data.signedUrl, expires_in: 600 }
}

/* ------------------------------------------------------------------ route table: URL -> database function */
// ":id" is the id in the URL. Body and query values are sent along with it.
const ROUTES: [method: string, pattern: string, fn: string][] = [
  ['GET', '/me', 'api_me'], ['PATCH', '/me', 'api_me'],
  ['GET', '/home', 'api_home'],

  ['GET', '/properties', 'api_get_properties'], ['POST', '/properties', 'api_add_property'],
  ['GET', '/properties/:id', 'api_get_property'], ['PATCH', '/properties/:id', 'api_update_property'],
  ['DELETE', '/properties/:id', 'api_delete_property'],
  ['PATCH', '/properties/:id/listing', 'api_update_listing'], ['POST', '/properties/:id/live', 'api_set_live'],
  ['POST', '/properties/:id/categories', 'api_add_category'],
  ['PATCH', '/categories/:id', 'api_update_category'], ['DELETE', '/categories/:id', 'api_delete_category'],
  ['POST', '/properties/:id/rooms', 'api_add_room'], ['DELETE', '/rooms/:id', 'api_delete_room'],
  ['POST', '/rooms/:id/beds', 'api_add_bed'], ['DELETE', '/beds/:id', 'api_delete_bed'],

  ['GET', '/properties/:id/meters', 'api_get_meters'],
  ['GET', '/rooms/:id/meter-readings', 'api_get_readings'], ['POST', '/rooms/:id/meter-readings', 'api_add_reading'],

  ['GET', '/tenants', 'api_get_tenants'], ['POST', '/tenants', 'api_add_tenant'],
  ['GET', '/tenants/:id', 'api_get_tenant'], ['PATCH', '/tenants/:id', 'api_update_tenant'],
  ['GET', '/tenants/:id/bookings', 'api_get_tenant_bookings'],
  ['POST', '/tenants/:id/documents', 'api_add_tenant_document'], ['DELETE', '/documents/:id', 'api_remove_tenant_document'],

  ['GET', '/bookings', 'api_get_bookings'], ['POST', '/bookings', 'api_add_booking'],
  ['GET', '/bookings/:id', 'api_get_booking'], ['PATCH', '/bookings/:id', 'api_update_booking'],
  ['DELETE', '/bookings/:id', 'api_delete_booking'],
  ['GET', '/bookings/:id/ledger', 'api_get_ledger'],
  ['POST', '/bookings/:id/activate', 'api_activate_booking'],
  ['POST', '/bookings/:id/notice', 'api_give_notice'], ['DELETE', '/bookings/:id/notice', 'api_cancel_notice'],
  ['POST', '/bookings/:id/move-out', 'api_move_out'], ['POST', '/bookings/:id/transfer', 'api_transfer_booking'],
  ['PUT', '/bookings/:id/agreement', 'api_set_agreement'],

  ['GET', '/invoices', 'api_get_invoices'], ['GET', '/invoices/:id', 'api_get_invoice'],
  ['PATCH', '/invoices/:id', 'api_update_invoice'], ['POST', '/invoices/:id/cancel', 'api_cancel_invoice'],
  ['GET', '/bookings/:id/invoice-preview', 'api_invoice_preview'], ['POST', '/bookings/:id/invoices', 'api_add_invoice'],

  ['GET', '/payments', 'api_get_payments'], ['POST', '/payments', 'api_add_payment'],
  ['GET', '/balances', 'api_get_balances'],

  ['GET', '/complaints', 'api_get_complaints'], ['POST', '/complaints', 'api_add_complaint'],
  ['GET', '/complaints/:id', 'api_get_complaint'], ['PATCH', '/complaints/:id', 'api_update_complaint'],

  ['GET', '/app-config', 'api_app_config'],
  ['GET', '/plans', 'api_plans'], ['POST', '/plans/checkout', 'api_plan_checkout'],
  ['GET', '/notices', 'api_get_notices'],
  ['GET', '/notifications', 'api_get_notifications'], ['POST', '/notifications/read', 'api_read_notifications'],
  ['PUT', '/push-pref', 'api_set_push_pref'],
  ['POST', '/push-token', 'api_register_push_token'], ['DELETE', '/push-token', 'api_remove_push_token'],

  ['GET', '/leads', 'api_get_leads'], ['POST', '/leads', 'api_add_lead'],
  ['GET', '/leads/:id', 'api_get_lead'], ['PATCH', '/leads/:id', 'api_update_lead'], ['DELETE', '/leads/:id', 'api_delete_lead'],
]

const compiled = ROUTES.map(([method, pattern, fn]) => ({
  method, fn,
  keys: Array.from(pattern.matchAll(/:(\w+)/g)).map((m) => m[1]),
  re: new RegExp('^' + pattern.replace(/:(\w+)/g, '([^/]+)') + '$'),
}))

const cleanQuery = (q?: Query) => {
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(q ?? {})) if (v !== undefined && v !== null && v !== '') out[k] = v
  return out
}

/* ------------------------------------------------------------------ the function every screen uses */
export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true } = opts
  const m = method.toUpperCase()

  // login (no session yet)
  if (path === '/auth/send-otp' && m === 'POST') return (await sendOtp(body)) as T
  if (path === '/auth/verify-otp' && m === 'POST') return (await verifyOtp(body)) as T
  if (path === '/auth/google' && m === 'POST') return (await loginGoogle()) as T
  if (path === '/auth/google-code' && m === 'POST') return (await finishGoogle(String((body as any)?.code ?? ''))) as T
  if (path === '/auth/logout' && m === 'POST') { await supabase.auth.signOut().catch(() => {}); return { ok: true } as T }

  // everything below needs a saved login
  if (auth) {
    try { await requireSession() } catch (e) { onUnauthorized?.(); throw e }
  }
  if (path === '/files' && m === 'POST') return (await uploadFile(body as any)) as T
  if (path === '/files/public' && m === 'POST') return (await uploadListingPhoto(body as any)) as T
  if (path === '/files/url' && m === 'GET') return (await fileLink(cleanQuery(query))) as T

  for (const r of compiled) {
    if (r.method !== m) continue
    const hit = r.re.exec(path)
    if (!hit) continue
    const params: Record<string, string> = {}
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(hit[i + 1]) })
    const p = { ...cleanQuery(query), ...((body as Record<string, unknown> | undefined) ?? {}), ...params }
    return rpc<T>(r.fn, p, auth)
  }
  throw new ApiError(`Unknown request ${m} ${path}`, 404, 'E_NOT_FOUND')
}
