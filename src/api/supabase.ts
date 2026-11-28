/*
| The one Supabase connection for the whole app.
| - the login session is saved on the phone and refreshed by itself
| - set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env (or in eas.json for a build)
*/
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { AppState, Platform } from 'react-native'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!url || !anonKey) {
  console.warn('Supabase is not set up: add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env and restart Expo.')
}

// While Expo builds or exports the app it runs this file on a server (Node) where there is no `window`.
// Browser storage does not exist there, so use an empty in-memory storage and do not save a session.
const onServer = Platform.OS === 'web' && typeof window === 'undefined'
const emptyStorage = {
  getItem: async (_key: string) => null as string | null,
  setItem: async (_key: string, _value: string) => {},
  removeItem: async (_key: string) => {},
}

export const supabase = createClient(url || 'http://localhost', anonKey || 'missing-key', {
  auth: {
    storage: onServer ? emptyStorage : AsyncStorage,
    autoRefreshToken: !onServer,
    persistSession: !onServer,
    detectSessionInUrl: false,
    flowType: 'pkce', // needed for Google sign-in (the app gets a one-time code, then swaps it for the session)
  },
})

// Refresh the login only while the app is open (Supabase's advice for React Native)
if (!onServer) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh()
    else supabase.auth.stopAutoRefresh()
  })
}
