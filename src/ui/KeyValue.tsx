import React from 'react'
import { View } from 'react-native'
import { useSettings } from '../settings/SettingsProvider'
import { T } from './AppText'

/** One line of a summary: grey label on the left, value on the right */
export function KeyValue({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  const { colors } = useSettings()
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5, gap: 10 }}>
      <T size={13.5} color={colors.muted} style={{ flex: 1 }}>{label}</T>
      <T w={bold ? 'bold' : 'semibold'} size={bold ? 16 : 13.5} color={color}>{value}</T>
    </View>
  )
}
