import { useState } from 'react'
import { router } from 'expo-router'
import { Alert } from '../ui/AppAlert'
import { useSettings } from '../settings/SettingsProvider'

/** Runs a server action, shows the error in an alert, and tells the button when it is busy */
export function useAction() {
  const { t, errText } = useSettings()
  const [busy, setBusy] = useState(false)

  async function run<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false }> {
    setBusy(true)
    try {
      const data = await fn()
      return { ok: true, data }
    } catch (e) {
      // plan over: the server refuses; offer the plans screen right in the alert
      const expired = (e as { code?: unknown } | null)?.code === 'PLAN_EXPIRED'
      Alert.alert(t('error'), errText(e), expired
        ? [{ text: t('cancel'), style: 'cancel' }, { text: t('choose'), onPress: () => router.push('/plans' as any) }]
        : undefined, { tone: 'error' })
      return { ok: false }
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}
