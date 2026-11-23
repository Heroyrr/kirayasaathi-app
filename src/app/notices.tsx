import React, { useEffect, useRef } from 'react'
import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { useSettings } from '../settings/SettingsProvider'
import { useGetNotificationsQuery, useReadNotificationsMutation } from '../store/api/notifications'
import { Screen } from '../ui/Screen'
import { Card } from '../ui/Card'
import { T } from '../ui/AppText'
import { Loader } from '../ui/Loader'
import { EmptyState } from '../ui/EmptyState'
import { Button } from '../ui/Button'
import { showDate, toYmd } from '../utils/dates'

const SAFE_PATH = /^\/[A-Za-z0-9/_-]*$/

// "23 Nov 2026, 10:42 am"
const stamp = (iso: string) => {
  const d = new Date(iso)
  return `${showDate(toYmd(d))}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

/** All notifications (new leads from RoomIndeed, messages from the KirayaSaathi team) with date and time. Opened from the bell icon. */
export default function NotificationsScreen() {
  const { t, colors, errText } = useSettings()
  const router = useRouter()
  const q = useGetNotificationsQuery()
  const [markRead] = useReadNotificationsMutation()
  const list = q.data?.items ?? []

  // remember which ones were new when the list opened, so they stay highlighted while the owner reads
  const fresh = useRef<Set<number>>(new Set())
  const seen = useRef(false)
  useEffect(() => {
    if (!q.data || seen.current) return
    seen.current = true
    q.data.items.forEach((n) => { if (!n.read) fresh.current.add(n.id) })
    if (q.data.unread > 0) markRead().catch(() => {})
  }, [q.data])

  return (
    <Screen title={t('m8')} back refreshing={q.isFetching && !q.isLoading} onRefresh={() => q.refetch()}>
      {q.isLoading ? (
        <Loader />
      ) : q.isError ? (
        <View style={{ gap: 12 }}>
          <T color={colors.red}>{errText(q.error)}</T>
          <Button title={t('retry')} onPress={() => q.refetch()} />
        </View>
      ) : list.length === 0 ? (
        <EmptyState icon="bell-outline" title={t('noticesEmpty')} sub={t('noticesEmptyH')} />
      ) : (
        list.map((n) => {
          const go = n.url && SAFE_PATH.test(n.url) ? n.url : null
          const isNew = fresh.current.has(n.id)
          return (
            <Pressable key={n.id} disabled={!go} onPress={() => go && router.push(go as any)}>
              <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderWidth: isNew ? 1 : 0, borderColor: colors.pri }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${colors.pri}22`, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={n.type === 'lead' ? 'user-plus' : 'bell'} size={19} color={colors.pri} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <T w="bold" size={14.5} style={{ flex: 1 }}>{n.title}</T>
                    {isNew ? (
                      <View style={{ backgroundColor: colors.pri, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 }}>
                        <T w="bold" size={10.5} color="#fff">{t('notifNew')}</T>
                      </View>
                    ) : null}
                  </View>
                  <T size={13.5}>{n.body}</T>
                  <T size={12} color={colors.muted} style={{ marginTop: 2 }}>{stamp(n.created_at)}</T>
                </View>
                {go ? <Feather name="chevron-right" size={18} color={colors.muted} style={{ alignSelf: 'center' }} /> : null}
              </Card>
            </Pressable>
          )
        })
      )}
    </Screen>
  )
}
