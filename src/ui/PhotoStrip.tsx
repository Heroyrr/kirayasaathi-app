import React from 'react'
import { Image, Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { usePickPhoto } from '../hooks/usePickPhoto'
import { useSettings } from '../settings/SettingsProvider'
import type { Picked } from '../utils/pickImage'
import { T } from './AppText'

/** Pick up to a few photos: shows what was chosen (tap the cross to remove) and an add box */
export function PhotoStrip({ label, value, onChange, max = 4 }: { label?: string; value: Picked[]; onChange: (v: Picked[]) => void; max?: number }) {
  const { colors } = useSettings()
  const pick = usePickPhoto()
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <T w="medium" size={12.5} color={colors.muted} style={{ marginBottom: 6 }}>{label}</T> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {value.map((p, i) => (
          <View key={p.uri}>
            <Image source={{ uri: p.uri }} style={{ width: 64, height: 64, borderRadius: 8 }} />
            <Pressable
              onPress={() => onChange(value.filter((_, j) => j !== i))}
              hitSlop={8}
              style={{ position: 'absolute', top: -7, right: -7, backgroundColor: colors.card, borderRadius: 11 }}
            >
              <Feather name="x-circle" size={22} color={colors.red} />
            </Pressable>
          </View>
        ))}
        {value.length < max ? (
          <Pressable
            onPress={async () => { const p = await pick(); if (p) onChange([...value, p]) }}
            style={{ width: 64, height: 64, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="plus" size={22} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}
