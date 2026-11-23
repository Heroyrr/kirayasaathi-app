// Supabase Edge Function: send-push
// Sends a push notification to every phone saved for the given owners, through the Expo push service.
// It is called by the database (pg_net) with a secret header, never by the app.
//
// Deploy:   supabase functions deploy send-push --no-verify-jwt
// Secret:   supabase secrets set PUSH_WEBHOOK_SECRET=<same value as the Vault secret push_webhook_secret>
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are added by Supabase automatically.)
import { createClient } from 'npm:@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''
// Optional: public https link of a banner image (2:1, for example 1024x512). It shows as the BIG picture when the
// notification is expanded, like Instagram. Set it with:  supabase secrets set PUSH_IMAGE_URL=https://.../push-banner.png
const IMAGE_URL = Deno.env.get('PUSH_IMAGE_URL') ?? ''
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const chunk = <T>(a: T[], n: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n))
  return out
}

type Payload = { user_ids?: number[]; title?: string; body?: string; image?: string; data?: Record<string, unknown> }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  if (!WEBHOOK_SECRET || req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) return json({ error: 'Unauthorized' }, 401)

  let p: Payload
  try { p = await req.json() } catch { return json({ error: 'Bad JSON' }, 400) }
  const ids = (p.user_ids ?? []).filter((n) => Number.isInteger(n))
  if (!ids.length || !p.title || !p.body) return json({ error: 'user_ids, title and body are required' }, 400)

  // 1. find the phones of these owners
  const tokens: string[] = []
  for (const part of chunk(ids, 200)) {
    const { data, error } = await db.from('push_tokens').select('token').in('user_id', part)
    if (error) return json({ error: error.message }, 500)
    for (const r of data ?? []) tokens.push(r.token)
  }
  if (!tokens.length) return json({ sent: 0, note: 'no phones registered' })

  // 2. send in batches of 100 (the Expo limit)
  let sent = 0
  const dead: string[] = []
  for (const batch of chunk(tokens, 100)) {
    const image = p.image || IMAGE_URL
    const messages = batch.map((to) => ({
      to,
      title: p.title,
      body: p.body,
      data: p.data ?? {},
      sound: 'default',
      priority: 'high',
      channelId: 'default', // the Android channel the app creates
      ...(image ? { richContent: { image } } : {}), // big picture in the expanded notification
    }))
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      })
      const out = await res.json()
      const tickets: { status: string; details?: { error?: string } }[] = out?.data ?? []
      tickets.forEach((t, i) => {
        if (t.status === 'ok') sent++
        else if (t.details?.error === 'DeviceNotRegistered') dead.push(batch[i]) // app removed or token expired
      })
    } catch (e) {
      console.error('Expo push request failed', e)
    }
  }

  // 3. forget phones that no longer exist
  if (dead.length) await db.from('push_tokens').delete().in('token', dead)
  return json({ sent, removed: dead.length })
})
