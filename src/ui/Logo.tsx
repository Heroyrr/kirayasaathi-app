import React from 'react'
import { Image } from 'react-native'

/** The KirayaSaathi house + rupee coin logo (a light rounded square) */
export function Logo({ size = 76 }: { size?: number }) {
  return <Image source={require('../../assets/images/logo.png')} style={{ width: size, height: size, borderRadius: size * 0.23 }} accessibilityLabel="KirayaSaathi" />
}
