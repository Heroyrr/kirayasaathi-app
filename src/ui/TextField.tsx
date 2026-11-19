import React, { useState } from 'react'
import { TextInput, View, type TextInputProps } from 'react-native'
import { useSettings } from '../settings/SettingsProvider'
import { T } from './AppText'

type Props = TextInputProps & { label?: string; prefix?: string; error?: string; right?: React.ReactNode }

export function TextField({ label, prefix, error, right, style, onFocus, onBlur, ...rest }: Props) {
  const { colors, font } = useSettings()
  const [focus, setFocus] = useState(false)
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <T w="medium" size={12.5} color={colors.muted} style={{ marginBottom: 5 }}>{label}</T> : null}
      <View
        style={{
          flexDirection: 'row', alignItems: rest.multiline ? 'flex-start' : 'center', borderRadius: 12, borderWidth: 1.5,
          ...(rest.multiline ? { minHeight: 92, paddingVertical: 10 } : { height: 48 }),
          borderColor: error ? colors.red : focus ? colors.pri : colors.line, backgroundColor: colors.card, paddingHorizontal: 12,
        }}
      >
        {prefix ? <T w="semibold" size={15} color={colors.muted} style={{ marginRight: 8 }}>{prefix}</T> : null}
        <TextInput
          {...rest}
          placeholderTextColor={colors.muted}
          maxFontSizeMultiplier={1.1}
          onFocus={(e) => { setFocus(true); onFocus?.(e) }}
          onBlur={(e) => { setFocus(false); onBlur?.(e) }}
          style={[{ flex: 1, fontFamily: font('medium'), fontSize: 14.5, color: colors.text, paddingVertical: 0 }, rest.multiline ? { textAlignVertical: 'top', minHeight: 70 } : null, style]}
        />
        {right ?? null}
      </View>
      {error ? <T size={12} color={colors.red} style={{ marginTop: 4 }}>{error}</T> : null}
    </View>
  )
}
