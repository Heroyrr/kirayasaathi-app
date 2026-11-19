import React from 'react'
import { Pressable } from 'react-native'

/** Round icon-only button with a soft tint of the icon colour */
export function IconButton({ onPress, children, tint, size = 40 }: { onPress: () => void; children: React.ReactNode; tint: string; size?: number }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: `${tint}22`, opacity: pressed ? 0.7 : 1 })}
    >
      {children}
    </Pressable>
  )
}
