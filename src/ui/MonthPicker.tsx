import React from 'react'
import { Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useSettings } from '../settings/SettingsProvider'
import { monthLabel, shiftMonth } from '../utils/dates'
import { T } from './AppText'

type Props = { label?: string; value: string; onChange: (ym: string) => void }

/** "<  Nov 2026  >": tap the arrows to go to the previous or next month. Value is "YYYY-MM". */
export function MonthPicker({ label, value, onChange }: Props) {
  const { colors } = useSettings()
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <T w="medium" size={12.5} color={colors.muted} style={{ marginBottom: 5 }}>{label}</T> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 6 }}>
        <Pressable onPress={() => onChange(shiftMonth(value, -1))} hitSlop={8} style={{ padding: 8 }}>
          <Feather name="chevron-left" size={22} color={colors.pri} />
        </Pressable>
        <T w="bold" size={15}>{monthLabel(value)}</T>
        <Pressable onPress={() => onChange(shiftMonth(value, 1))} hitSlop={8} style={{ padding: 8 }}>
          <Feather name="chevron-right" size={22} color={colors.pri} />
        </Pressable>
      </View>
    </View>
  )
}
