const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const LOOKUP = new Uint8Array(256)
for (let i = 0; i < CHARS.length; i++) LOOKUP[CHARS.charCodeAt(i)] = i

/** base64 text -> bytes (no extra package needed) */
export function base64ToBytes(input: string): Uint8Array {
  const b64 = input.replace(/[\r\n\s]/g, '')
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  const out = new Uint8Array((b64.length * 3) / 4 - pad)
  let p = 0
  for (let i = 0; i < b64.length; i += 4) {
    const a = LOOKUP[b64.charCodeAt(i)]
    const b = LOOKUP[b64.charCodeAt(i + 1)]
    const c = LOOKUP[b64.charCodeAt(i + 2)]
    const d = LOOKUP[b64.charCodeAt(i + 3)]
    if (p < out.length) out[p++] = (a << 2) | (b >> 4)
    if (p < out.length) out[p++] = ((b & 15) << 4) | (c >> 2)
    if (p < out.length) out[p++] = ((c & 3) << 6) | d
  }
  return out
}
