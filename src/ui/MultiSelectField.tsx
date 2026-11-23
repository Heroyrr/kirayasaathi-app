import React, { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useSettings } from '../settings/SettingsProvider'
import { Button } from './Button'
import { Sheet } from './Sheet'
import { T } from './AppText'

export type MultiOption = { id: number | string; label: string }

/** Dropdown where MANY items can be ticked (leads with more than one property). */
export function MultiSelectField({ label, hint, values, options, onChange, placeholder }: {
  label?: string
  hint?: string
  values: (number | string)[]
  options: MultiOption[]
  onChange: (ids: (number | string)[]) => void
  placeholder?: string
}) {
  const { colors, t } = useSettings()
  const [open, setOpen] = useState(false)
  const chosen = options.filter((o) => values.includes(o.id))
  const toggle = (id: number | string) => onChange(values.includes(id) ? values.filter((v) => v !== id) : [...values, id])
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <T w="medium" size={12.5} color={colors.muted} style={{ marginBottom: 5 }}>{label}</T> : null}
      <Pressable
        onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}
      >
        <T w="medium" size={14.5} color={chosen.length ? colors.text : colors.muted} style={{ flex: 1 }} numberOfLines={2}>
          {chosen.length ? chosen.map((c) => c.label).join(', ') : placeholder ?? t('selectProps')}
        </T>
        <Feather name="chevron-down" size={20} color={colors.muted} />
      </Pressable>
      {hint ? <T size={12} color={colors.muted} style={{ marginTop: 4 }}>{hint}</T> : null}
      {open ? (
        <Sheet title={label ?? t('selectProps')} onClose={() => setOpen(false)}>
          <T size={12.5} color={colors.muted} style={{ marginBottom: 6 }}>{t('nSelected', { n: values.length })}</T>
          {options.map((o) => {
            const on = values.includes(o.id)
            return (
              <Pressable
                key={String(o.id)}
                onPress={() => toggle(o.id)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 10 }}
              >
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: on ? colors.btn : colors.muted, backgroundColor: on ? colors.btn : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Feather name="check" size={15} color="#fff" /> : null}
                </View>
                <T w={on ? 'bold' : 'medium'} size={15} color={on ? colors.pri : colors.text} style={{ flex: 1 }}>{o.label}</T>
              </Pressable>
            )
          })}
          <View style={{ height: 14 }} />
          <Button title={t('ok')} onPress={() => setOpen(false)} />
        </Sheet>
      ) : null}
    </View>
  )
}
