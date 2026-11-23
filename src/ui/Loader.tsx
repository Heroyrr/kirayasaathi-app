import React from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useSettings } from '../settings/SettingsProvider'
import { T } from './AppText'

/** Spinner shown while a screen or a block loads. Use `inline` for a small one inside a card or a sheet. */
export function Loader({ inline, label }: { inline?: boolean; label?: string }) {
  const { colors } = useSettings()
  if (inline) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
        <ActivityIndicator size="small" color={colors.pri} />
        {label ? <T size={13} color={colors.muted}>{label}</T> : null}
      </View>
    )
  }
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10 }}>
      <ActivityIndicator size="large" color={colors.pri} />
      {label ? <T size={13} color={colors.muted}>{label}</T> : null}
    </View>
  )
}
