import React from 'react'
import { Text, type TextProps } from 'react-native'
import { useSettings } from '../settings/SettingsProvider'
import type { Weight } from '../theme/fonts'

/** Every font size in the app is multiplied by this number. Lower it to make all text smaller. */
export const TEXT_SCALE = 0.86

type Props = TextProps & { w?: Weight; size?: number; color?: string }

/** Text that always uses the right font for the current language (Inter or Noto Sans Devanagari) */
export function T({ w = 'regular', size = 14, color, style, ...rest }: Props) {
  const { font, colors } = useSettings()
  const px = Math.round(size * TEXT_SCALE * 10) / 10
  return (
    <Text
      maxFontSizeMultiplier={1.1}
      {...rest}
      style={[{ fontFamily: font(w), fontSize: px, lineHeight: Math.round(px * 1.4), color: color ?? colors.text }, style]}
    />
  )
}
