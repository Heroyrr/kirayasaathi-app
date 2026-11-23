import React from 'react'
import { Linking, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSettings } from '../../settings/SettingsProvider'
import { T } from '../../ui/AppText'
import { Button } from '../../ui/Button'
import { useUpdate } from './UpdateProvider'

/** Full screen shown instead of the app when the installed version is older than min_version */
export function ForceUpdateScreen() {
  const { t, colors } = useSettings()
  const insets = useSafeAreaInsets()
  const { message, apkUrl, latest } = useUpdate()
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 28, paddingTop: insets.top + 28, gap: 14 }}>
      <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.btn, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name="download-cloud" size={40} color="#fff" />
      </View>
      <T w="bold" size={22} style={{ textAlign: 'center' }}>{t('updReqT')}</T>
      <T size={14.5} color={colors.muted} style={{ textAlign: 'center' }}>{message || t('updReqH')}</T>
      {latest ? <T size={12.5} color={colors.muted}>v{latest}</T> : null}
      {apkUrl ? (
        <Button title={t('updNow')} onPress={() => { Linking.openURL(apkUrl).catch(() => {}) }} style={{ alignSelf: 'stretch', marginTop: 8 }} />
      ) : (
        <T size={13} color={colors.red} style={{ textAlign: 'center' }}>{t('updNoLink')}</T>
      )}
    </View>
  )
}
