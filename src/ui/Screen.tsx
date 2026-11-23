import React from 'react'
import { Pressable, RefreshControl, ScrollView, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { useSettings } from '../settings/SettingsProvider'
import { useAuth } from '../auth/AuthProvider'
import { useGetNotificationsQuery } from '../store/api/notifications'
import { T } from './AppText'

/** Notification bell (with unread count) and light/dark button shown in the header band.
 *  The language switch now lives only in More > Settings. */
export function HeaderTools() {
  const { isDark, setMode } = useSettings()
  const { status } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const q = useGetNotificationsQuery(undefined, { skip: status !== 'in', pollingInterval: 60000 })
  const unread = q.data?.unread ?? 0
  const btn = { width: 38, height: 38, borderRadius: 19, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'rgba(255,255,255,0.16)' }
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {status === 'in' ? (
        <Pressable onPress={() => { if (pathname !== '/notices') router.push('/notices' as any) }} style={btn} hitSlop={6}>
          <Feather name="bell" size={18} color="#fff" />
          {unread > 0 ? (
            <View style={{ position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: '#e53935', borderWidth: 1.5, borderColor: '#1f5c68', alignItems: 'center', justifyContent: 'center' }}>
              <T w="bold" size={10.5} color="#fff" style={{ lineHeight: 14 }}>{unread > 9 ? '9+' : String(unread)}</T>
            </View>
          ) : null}
        </Pressable>
      ) : null}
      <Pressable onPress={() => setMode(isDark ? 'light' : 'dark')} style={btn} hitSlop={6}>
        <Feather name={isDark ? 'sun' : 'moon'} size={18} color="#fff" />
      </Pressable>
    </View>
  )
}

type Props = {
  title: string
  sub?: string
  children: React.ReactNode
  scroll?: boolean
  back?: boolean
  refreshing?: boolean
  onRefresh?: () => void
  fab?: React.ReactNode
  /** lets a screen scroll itself back to the top (for example when a form moves to its next step) */
  scrollRef?: React.Ref<ScrollView>
}

/** Teal header band with the content sheet sliding over it, like the design */
export function Screen({ title, sub, children, scroll = true, back, refreshing, onRefresh, fab, scrollRef }: Props) {
  const { colors } = useSettings()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  return (
    <View style={{ flex: 1, backgroundColor: colors.hd }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 30 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {back ? (
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)' as any))}
              hitSlop={8}
              style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)', marginRight: 10 }}
            >
              <Feather name="chevron-left" size={22} color="#fff" />
            </Pressable>
          ) : null}
          <View style={{ flex: 1, paddingRight: 10 }}>
            <T w="bold" size={21} color="#fff" numberOfLines={1}>{title}</T>
            {sub ? <T size={13} color="rgba(255,255,255,0.8)" numberOfLines={1}>{sub}</T> : null}
          </View>
          <HeaderTools />
        </View>
      </View>
      <View style={{ flex: 1, marginTop: -16, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.bg, overflow: 'hidden' }}>
        {scroll ? (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ padding: 14, paddingBottom: 90 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.pri} /> : undefined}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1, padding: 14 }}>{children}</View>
        )}
        {fab ? <View style={{ position: 'absolute', right: 16, bottom: 16 }}>{fab}</View> : null}
      </View>
    </View>
  )
}
