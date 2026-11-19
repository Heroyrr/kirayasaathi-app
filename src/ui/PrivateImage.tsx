import React from 'react'
import { Image, Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useOpenFile } from '../hooks/useOpenFile'
import { useSettings } from '../settings/SettingsProvider'
import { useGetFileLinkQuery } from '../store/api/files'

/** Small picture of a private file. Tap to open it big. */
export function PrivateImage({ fileKey, size = 72 }: { fileKey: string; size?: number }) {
  const { colors } = useSettings()
  const link = useGetFileLinkQuery(fileKey)
  const { open } = useOpenFile()
  return (
    <Pressable onPress={() => open(fileKey)}>
      {link.data?.url ? (
        <Image source={{ uri: link.data.url }} style={{ width: size, height: size, borderRadius: 8, backgroundColor: colors.line }} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: 8, backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="image" size={20} color={colors.muted} />
        </View>
      )}
    </Pressable>
  )
}
