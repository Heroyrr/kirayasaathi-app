/*
| Phones can open the app with ownerapp:///auth/callback?code=... (three slashes) or ownerapp://auth/callback?code=...
| Make both land on the same screen so the "page could not be found" error never shows.
*/
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (path.includes('auth/callback')) {
      const q = path.includes('?') ? path.slice(path.indexOf('?')) : ''
      return '/auth/callback' + q
    }
  } catch {}
  return path
}
