import React from 'react'
import { View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useSettings } from '../../settings/SettingsProvider'
import { useGetNotificationsQuery } from '../../store/api/notifications'
import { Screen } from '../../ui/Screen'
import { Card } from '../../ui/Card'
import { T } from '../../ui/AppText'
import { Loader } from '../../ui/Loader'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { showDate, toYmd } from '../../utils/dates'

const SAFE_PATH = /^\/[A-Za-z0-9/_-]*$/
const stamp = (iso: string) => {
  const d = new Date(iso)
  return `${showDate(toYmd(d))}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

/** One notification: title, full message, date and time. ?by=notice means the id is the notice id (opened from a push). */
export default function NotificationDetail() {
  const { id, by } = useLocalSearchParams<{ id: string; by?: string }>()
  const { t, colors } = useSettings()
  const router = useRouter()
  const q = useGetNotificationsQuery()
  const items = q.data?.items ?? []
  const n = items.find((x) => (by === 'notice' ? String(x.notice_id) === String(id) : String(x.id) === String(id)))
  // another screen to open (for example /plans), but never the list itself
  const go = n?.url && SAFE_PATH.test(n.url) && !n.url.startsWith('/notices') && !n.url.startsWith('/notification') ? n.url : null

  return (
    <Screen title={t('notifDetail')} back>
      {q.isLoading || (!n && q.isFetching) ? (
        <Loader />
      ) : !n ? (
        <EmptyState icon="bell-off-outline" title={t('notifGone')} />
      ) : (
        <Card style={{ gap: 12, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${colors.pri}22`, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="bell" size={21} color={colors.pri} />
            </View>
            <View style={{ flex: 1 }}>
              <T w="bold" size={17}>{n.title}</T>
              <T size={12} color={colors.muted} style={{ marginTop: 2 }}>{stamp(n.created_at)}</T>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: colors.line }} />
          <T size={15} selectable style={{ lineHeight: 23 }}>{n.body}</T>
          {go ? <Button title={t('notifOpen')} onPress={() => router.push(go as any)} style={{ marginTop: 6 }} /> : null}
        </Card>
      )}
    </Screen>
  )
}
