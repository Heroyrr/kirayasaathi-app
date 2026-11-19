import React from 'react'
import { View } from 'react-native'
import { T } from './AppText'
import { useTone, type Tone } from './Badge'

type Props = { label: string; value: string; sub?: string; tone: Tone; compact?: boolean }

/** compact = small tile that shares a row equally with 2 or 3 others (no wrapping, smaller text) */
export function StatTile({ label, value, sub, tone, compact }: Props) {
  const { fg, bg } = useTone(tone)
  if (compact) {
    return (
      <View style={{ flex: 1, backgroundColor: bg, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 9 }}>
        <T w="bold" size={14.5} color={fg} numberOfLines={1} adjustsFontSizeToFit>{value}</T>
        <T w="medium" size={11.5} color={fg} numberOfLines={1}>{label}</T>
      </View>
    )
  }
  return (
    <View style={{ flexGrow: 1, flexBasis: '47%', backgroundColor: bg, borderRadius: 14, padding: 12 }}>
      <T w="bold" size={21} color={fg}>{value}</T>
      <T w="semibold" size={12.5} color={fg}>{label}</T>
      {sub ? <T size={11.5} color={fg} style={{ opacity: 0.85 }}>{sub}</T> : null}
    </View>
  )
}
