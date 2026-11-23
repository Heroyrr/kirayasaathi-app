import React, { useCallback, useEffect, useState } from 'react'
import { Linking, Pressable, Switch, View } from 'react-native'
import { Alert } from '../../ui/AppAlert'
import { useFocusEffect, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useAuth } from '../../auth/AuthProvider'
import { useSettings, type Mode } from '../../settings/SettingsProvider'
import { api } from '../../api/client'
import { Screen } from '../../ui/Screen'
import { Card } from '../../ui/Card'
import { T } from '../../ui/AppText'
import { Button } from '../../ui/Button'
import { Badge } from '../../ui/Badge'
import { fmtPhone } from '../../utils/format'
import { useGetNotificationsQuery, useSetPushPrefMutation } from '../../store/api/notifications'
import { enablePush, pushPermission, pushSupported, unregisterPush } from '../../features/notifications/push'
import type { Key } from '../../i18n/strings'
import type { Lang } from '../../i18n/strings'

function Segment<V extends string>({ value, options, onChange }: { value: V; options: { v: V; label: string }[]; onChange: (v: V) => void }) {
  const { colors } = useSettings()
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {options.map((o) => {
        const on = o.v === value
        return (
          <Pressable
            key={o.v}
            onPress={() => onChange(o.v)}
            style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, backgroundColor: on ? colors.btn : 'transparent', borderWidth: 1, borderColor: on ? colors.btn : colors.line }}
          >
            <T w="semibold" size={12.5} color={on ? '#fff' : colors.text}>{o.label}</T>
          </Pressable>
        )
      })}
    </View>
  )
}

const MENU: { key: Key; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'm0', icon: 'credit-card' },
  { key: 'm6', icon: 'users' },
  { key: 'm1', icon: 'activity' },
  { key: 'm2', icon: 'tool' },
  { key: 'm8', icon: 'bell' },
  { key: 'm7', icon: 'award' },
]

export default function More() {
  const { t, colors, lang, setLang, mode, setMode, errText } = useSettings()
  const { user, subscription, logout } = useAuth()
  const router = useRouter()

  // ---- push notifications on/off (default ON) ----
  const pref = useGetNotificationsQuery()
  const [setPref] = useSetPushPrefMutation()
  const [pushOn, setPushOn] = useState(true)
  const [osOff, setOsOff] = useState(false) // allowed in the app, but blocked in the phone settings
  useEffect(() => { if (pref.data) setPushOn(pref.data.push_enabled) }, [pref.data?.push_enabled])
  const checkOs = useCallback(() => {
    if (!pushSupported()) return setOsOff(false)
    pushPermission().then((p) => setOsOff(p === 'blocked')).catch(() => {})
  }, [])
  useFocusEffect(checkOs)

  const togglePush = async (on: boolean) => {
    setPushOn(on)
    try {
      await setPref(on).unwrap()
      if (on) {
        const r = await enablePush() // system popup if needed + saves this phone
        if (r === 'blocked') Alert.alert(t('ppBlockedT'), t('ppBlockedB'), [
          { text: t('pushOpen'), onPress: () => { Linking.openSettings().catch(() => {}) } },
          { text: t('ppLater'), style: 'cancel' },
        ], { tone: 'warning', icon: 'bell-off' })
        else if (r === 'unsupported') Alert.alert(t('pushT'), t('ppNoPhone'), undefined, { tone: 'info', icon: 'bell' })
        checkOs()
      } else {
        await unregisterPush().catch(() => {})
      }
    } catch (e) {
      setPushOn(!on) // could not save: put the switch back
      Alert.alert(t('pushT'), errText(e), undefined, { tone: 'error' })
    }
  }

  const openMenu = (key: Key) => {
    if (key === 'm1') router.push('/meters' as any)
    else if (key === 'm0') router.push('/payments' as any)
    else if (key === 'm6') router.push('/leads' as any)
    else if (key === 'm2') router.push('/support' as any)
    else if (key === 'm8') router.push('/notices' as any)
    else if (key === 'm7') router.push('/plans' as any)
    else Alert.alert(t(key), t('soon'))
  }

  const changeLang = (l: Lang) => {
    setLang(l)
    api('/me', { method: 'PATCH', body: { language: l } }).catch(() => {})
  }
  const confirmLogout = () =>
    Alert.alert(t('logout'), t('logoutQ'), [
      { text: t('logout'), style: 'destructive', onPress: () => { logout() } },
      { text: t('cancel'), style: 'cancel' },
    ], { tone: 'danger', icon: 'log-out' })

  return (
    <Screen title={t('more')}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.btn, alignItems: 'center', justifyContent: 'center' }}>
          <T w="bold" size={20} color="#fff">{(user?.name ?? '?').charAt(0).toUpperCase()}</T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T w="bold" size={16}>{user?.name}</T>
          <T size={13} color={colors.muted}>{user?.email ?? (user?.phone ? `+91 ${fmtPhone(user.phone)}` : '')}</T>
        </View>
        {subscription?.plan ? <Badge label={subscription.plan.toUpperCase()} tone={subscription.state === 'active' ? 'green' : 'red'} /> : null}
      </Card>

      <Card>
        <T w="bold" size={15} style={{ marginBottom: 10 }}>{t('settings')}</T>
        <T w="medium" size={12.5} color={colors.muted} style={{ marginBottom: 6 }}>{t('lang')}</T>
        <Segment<Lang> value={lang} onChange={changeLang} options={[{ v: 'en', label: 'English' }, { v: 'hi', label: 'हिन्दी' }]} />
        <T w="medium" size={12.5} color={colors.muted} style={{ marginTop: 14, marginBottom: 6 }}>{t('theme')}</T>
        <Segment<Mode>
          value={mode}
          onChange={setMode}
          options={[{ v: 'light', label: t('light') }, { v: 'dark', label: t('dark') }, { v: 'system', label: t('sys') }]}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line }}>
          <Feather name="bell" size={19} color={colors.pri} />
          <View style={{ flex: 1 }}>
            <T w="medium" size={14.5}>{t('pushT')}</T>
            <T size={12} color={colors.muted}>{t('pushH')}</T>
          </View>
          <Switch
            value={pushOn}
            onValueChange={togglePush}
            trackColor={{ false: colors.line, true: colors.btn }}
            thumbColor="#ffffff"
          />
        </View>
        {pushOn && osOff ? (
          <Pressable onPress={() => { Linking.openSettings().catch(() => {}) }} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.amberbg, borderRadius: 10, padding: 10 }}>
            <Feather name="alert-triangle" size={16} color={colors.amber} />
            <T size={12.5} color={colors.amber} style={{ flex: 1 }}>{t('pushOsOff')}</T>
            <T w="bold" size={12.5} color={colors.amber}>{t('pushOpen')}</T>
          </Pressable>
        ) : null}
      </Card>

      <Card style={{ paddingVertical: 4 }}>
        {MENU.map((m, i) => (
          <Pressable
            key={m.key}
            onPress={() => openMenu(m.key)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}
          >
            <Feather name={m.icon} size={19} color={colors.pri} />
            <T w="medium" size={14.5} style={{ flex: 1 }}>{t(m.key)}</T>
            <Feather name="chevron-right" size={18} color={colors.muted} />
          </Pressable>
        ))}
      </Card>

      <Button title={t('logout')} variant="danger" onPress={confirmLogout} />
    </Screen>
  )
}
