/** Compares two versions like "1.0.3" and "1.2". Returns -1 if a < b, 0 if equal, 1 if a > b. Bad input counts as 0.0.0 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const parts = (v: string) => String(v ?? '').trim().split('.').map((n) => parseInt(n, 10) || 0)
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length, 3); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}
