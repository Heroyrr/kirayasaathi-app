import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { appStorage } from '../utils/appStorage'
import { api, ApiError, setToken, setUnauthorizedHandler } from '../api/client'
import type { Subscription, User } from '../api/types'
import { unregisterPush } from '../features/notifications/push'

type Status = 'loading' | 'out' | 'in'
type Ctx = {
  status: Status
  user: User | null
  subscription: Subscription | null
  sendOtp: (phone: string) => Promise<{ is_new: boolean; dev_otp?: string }>
  verifyOtp: (phone: string, otp: string, name?: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  finishGoogleCode: (code: string) => Promise<void>
  logout: () => Promise<void>
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<Ctx>(null as unknown as Ctx)
export const useAuth = () => useContext(AuthContext)

const clearSession = async () => {
  setToken(null)
  await appStorage.remove('oa_token').catch(() => {})
  await appStorage.remove('oa_user').catch(() => {})
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [subscription, setSub] = useState<Subscription | null>(null)

  const logoutLocal = useCallback(async () => {
    await clearSession()
    setUser(null)
    setSub(null)
    setStatus('out')
  }, [])

  // Any 401 from the server means the token is no longer valid
  useEffect(() => {
    setUnauthorizedHandler(() => { logoutLocal() })
    return () => setUnauthorizedHandler(null)
  }, [logoutLocal])

  // Restore the session when the app opens
  useEffect(() => {
    ;(async () => {
      const saved = await appStorage.get('oa_token').catch(() => null)
      if (!saved) return setStatus('out')
      setToken(saved)
      try {
        const me = await api<{ user: User; subscription: Subscription }>('/me')
        setUser(me.user)
        setSub(me.subscription)
        appStorage.set('oa_user', JSON.stringify(me.user)).catch(() => {})
        setStatus('in')
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return // handler already logged out
        // Server not reachable: stay signed in with the saved profile
        const cached = await appStorage.get('oa_user').catch(() => null)
        if (cached) { setUser(JSON.parse(cached)); setStatus('in') } else { await logoutLocal() }
      }
    })()
  }, [logoutLocal])

  const sendOtp: Ctx['sendOtp'] = (phone) =>
    api('/auth/send-otp', { method: 'POST', body: { phone }, auth: false })

  const verifyOtp: Ctx['verifyOtp'] = async (phone, otp, name) => {
    const res = await api<{ token: string; user: User; subscription: Subscription }>('/auth/verify-otp', {
      method: 'POST',
      body: { phone, otp, ...(name ? { name } : {}) },
      auth: false,
    })
    setToken(res.token)
    await appStorage.set('oa_token', res.token)
    await appStorage.set('oa_user', JSON.stringify(res.user))
    setUser(res.user)
    setSub(res.subscription)
    setStatus('in')
  }

  const saveLogin = async (res: { token: string; user: User; subscription: Subscription }) => {
    setToken(res.token)
    await appStorage.set('oa_token', res.token)
    await appStorage.set('oa_user', JSON.stringify(res.user))
    setUser(res.user)
    setSub(res.subscription)
    setStatus('in')
  }

  // Google login: a new owner gets the free plan automatically
  const signInWithGoogle: Ctx['signInWithGoogle'] = async () => {
    await saveLogin(await api('/auth/google', { method: 'POST', auth: false }))
  }

  // Google brought the owner back to the app with a code (used by the /auth/callback screen)
  const finishGoogleCode: Ctx['finishGoogleCode'] = async (code) => {
    await saveLogin(await api('/auth/google-code', { method: 'POST', body: { code }, auth: false }))
  }

  const logout = async () => {
    // stop pushes for this owner on this phone (needs the login, so it runs before sign out)
    try { await unregisterPush() } catch {}
    try { await api('/auth/logout', { method: 'POST' }) } catch {}
    await logoutLocal()
  }

  const refreshMe = async () => {
    const me = await api<{ user: User; subscription: Subscription }>('/me')
    setUser(me.user)
    setSub(me.subscription)
  }

  const value = useMemo(
    () => ({ status, user, subscription, sendOtp, verifyOtp, signInWithGoogle, finishGoogleCode, logout, refreshMe }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, user, subscription]
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
