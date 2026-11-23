/*
| Update check. When the owner is logged in and the app opens (or comes back to the front), it asks the server for
| app_config and compares versions:
|   app version < min_version     -> state "forced": Gate shows a blocking screen
|   app version < latest_version  -> state "soft":   Home shows an "Update available" banner
| If the server cannot be reached the app simply keeps working (it never blocks an owner because of a network problem).
*/
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AppState } from 'react-native'
import Constants from 'expo-constants'
import { api } from '../../api/client'
import { useAuth } from '../../auth/AuthProvider'
import { useSettings } from '../../settings/SettingsProvider'
import { compareVersions } from '../../utils/version'
import type { AppConfig } from '../../api/types'

type UpdateState = 'ok' | 'soft' | 'forced'
type Ctx = { state: UpdateState; message: string; apkUrl: string | null; latest: string; dismiss: () => void }

const UpdateContext = createContext<Ctx>({ state: 'ok', message: '', apkUrl: null, latest: '', dismiss: () => {} })
export const useUpdate = () => useContext(UpdateContext)

export const appVersion = () => Constants.expoConfig?.version ?? '0.0.0'

export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  const { lang } = useSettings()
  const [cfg, setCfg] = useState<AppConfig | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const check = useCallback(async () => {
    try {
      setCfg(await api<AppConfig>('/app-config'))
    } catch {
      /* offline or not set up yet: keep the last answer */
    }
  }, [])

  useEffect(() => {
    if (status !== 'in') { setCfg(null); setDismissed(false); return }
    check()
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check() })
    return () => sub.remove()
  }, [status, check])

  const value = useMemo<Ctx>(() => {
    const v = appVersion()
    let state: UpdateState = 'ok'
    if (cfg) {
      if (compareVersions(v, cfg.min_version) < 0) state = 'forced'
      else if (compareVersions(v, cfg.latest_version) < 0 && !dismissed) state = 'soft'
    }
    const message = (lang === 'hi' ? cfg?.message_hi : cfg?.message_en) || cfg?.message_en || cfg?.message_hi || ''
    return { state, message, apkUrl: cfg?.apk_url ?? null, latest: cfg?.latest_version ?? '', dismiss: () => setDismissed(true) }
  }, [cfg, dismissed, lang])

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
}
