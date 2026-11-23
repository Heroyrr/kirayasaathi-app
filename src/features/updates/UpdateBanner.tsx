import React from 'react'
import { Linking, Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useSettings } from '../../settings/SettingsProvider'
import { T } from '../../ui/AppText'
import { useTone } from '../../ui/Badge'
import { Alert } from '../../ui/AppAlert'
import { useUpdate } from './UpdateProvider'

/** "Update available" banner (shown on Home when a newer version exists but the old one still works) */
export function UpdateBanner() {
  const { t } = useSettings()
  const { state, message, apkUrl, dismiss } = useUpdate()
  const { fg, bg } = useTone('amber')
  if (state !== 'soft') return null

  const update = () => {
    if (apkUrl) Linking.openURL(apkUrl).catch(() => {})
    else Alert.alert(t('updAvail'), t('updNoLink'))
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: bg, borderRadius: 12, padding: 11, marginBottom: 12, gap: 10 }}>
      <Feather name="download" size={18} color={fg} />
      <View style={{ flex: 1 }}>
        <T w="bold" size={13} color={fg}>{t('updAvail')}</T>
        <T size={12.5} color={fg}>{message || t('updAvailH')}</T>
      </View>
      <Pressable onPress={update} hitSlop={6}><T w="bold" size={13} color={fg}>{t('updNow')}</T></Pressable>
      <Pressable onPress={dismiss} hitSlop={8}><Feather name="x" size={16} color={fg} /></Pressable>
    </View>
  )
}
