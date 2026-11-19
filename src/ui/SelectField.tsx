import React, { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useSettings } from '../settings/SettingsProvider'
import { Sheet } from './Sheet'
import { T } from './AppText'

export type Option = { id: number | string; label: string }

/** Dropdown: looks like the other fields, opens a list to pick one. Good for many properties. */
export function SelectField({ label, value, options, onChange, placeholder }: {
  label?: string
  value?: number | string | null
  options: Option[]
  onChange: (id: number | string) => void
  placeholder?: string
}) {
  const { colors, t } = useSettings()
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.id === value)
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <T w="medium" size={12.5} color={colors.muted} style={{ marginBottom: 5 }}>{label}</T> : null}
      <Pressable
        onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 12, gap: 8 }}
      >
        <T w="medium" size={14.5} color={current ? colors.text : colors.muted} style={{ flex: 1 }} numberOfLines={1}>
          {current ? current.label : placeholder ?? t('selectOne')}
        </T>
        <Feather name="chevron-down" size={20} color={colors.muted} />
      </Pressable>
      {open ? (
        <Sheet title={label ?? t('selectOne')} onClose={() => setOpen(false)}>
          {options.map((o) => {
            const on = o.id === value
            return (
              <Pressable
                key={String(o.id)}
                onPress={() => { onChange(o.id); setOpen(false) }}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 10 }}
              >
                <T w={on ? 'bold' : 'medium'} size={15} color={on ? colors.pri : colors.text} style={{ flex: 1 }}>{o.label}</T>
                {on ? <Feather name="check" size={20} color={colors.pri} /> : null}
              </Pressable>
            )
          })}
        </Sheet>
      ) : null}
    </View>
  )
}
