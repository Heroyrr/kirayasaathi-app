import React, { useEffect, useState } from 'react'
import { Linking, Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import { statusLook } from '../../features/bookings/status'
import { useSettings } from '../../settings/SettingsProvider'
import { useGetTenantsQuery } from '../../store/api/tenants'
import { Avatar } from '../../ui/Avatar'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { EmptyState } from '../../ui/EmptyState'
import { Fab } from '../../ui/Fab'
import { Screen } from '../../ui/Screen'
import { T } from '../../ui/AppText'
import { TextField } from '../../ui/TextField'
import { inr } from '../../utils/format'

type Filter = 'all' | 'staying' | 'out' | 'notice'

/** Round icon button (no text) */
function IconBtn({ onPress, children, tint }: { onPress: () => void; children: React.ReactNode; tint: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: `${tint}22`, opacity: pressed ? 0.7 : 1 })}
    >
      {children}
    </Pressable>
  )
}

export default function TenantsList() {
  const { t, colors, errText } = useSettings()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    const h = setTimeout(() => setDebounced(search.trim()), 350)
    return () => clearTimeout(h)
  }, [search])

  const q = useGetTenantsQuery({ search: debounced || undefined })

  // Staying = has an active stay. Notice = has a stay on notice. Moved out = no current stay but had one.
  const list = (q.data ?? []).filter((x) => {
    const live = x.live_bookings
    if (filter === 'staying') return live.some((b) => b.status === 'active')
    if (filter === 'notice') return live.some((b) => b.status === 'notice')
    if (filter === 'out') return live.length === 0 && x.bookings_count > 0
    return true
  })

  return (
    <Screen
      title={t('tenants')}
      refreshing={q.isFetching && !q.isLoading}
      onRefresh={() => q.refetch()}
      fab={<Fab onPress={() => router.push('/tenant/new' as any)} />}
    >
      <TextField value={search} onChangeText={setSearch} placeholder={t('tSearch')} autoCapitalize="none" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <Chip label={t('fAll')} active={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label={t('fLive')} active={filter === 'staying'} onPress={() => setFilter('staying')} />
        <Chip label={t('fOut')} active={filter === 'out'} onPress={() => setFilter('out')} />
        <Chip label={t('fNotice')} active={filter === 'notice'} onPress={() => setFilter('notice')} />
      </View>

      {q.isLoading ? (
        <T color={colors.muted} style={{ textAlign: 'center', marginTop: 30 }}>{t('loading')}</T>
      ) : q.isError ? (
        <Card>
          <T color={colors.red} style={{ marginBottom: 12 }}>{errText(q.error)}</T>
          <Button title={t('retry')} onPress={() => q.refetch()} />
        </Card>
      ) : list.length === 0 ? (
        <EmptyState icon="account-group-outline" title={t('noTen')} sub={t('noTenH')} />
      ) : (
        list.map((x) => {
          const live = x.live_bookings
          const allAgr = live.length > 0 && live.every((b) => b.agreement_done)
          return (
            <Pressable key={x.id} onPress={() => router.push(`/tenant/${x.id}` as any)}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar name={x.name} id={x.id} />
                  <View style={{ flex: 1 }}>
                    <T w="bold" size={15.5} numberOfLines={1}>{x.name}</T>
                    {x.phone ? <T size={12.5} color={colors.muted}>+91 {x.phone}</T> : null}
                  </View>
                  {x.phone ? (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <IconBtn tint={colors.pri} onPress={() => Linking.openURL(`tel:${x.phone}`)}>
                        <Feather name="phone" size={18} color={colors.pri} />
                      </IconBtn>
                      <IconBtn tint="#25D366" onPress={() => Linking.openURL(`https://wa.me/91${x.phone}`)}>
                        <MaterialCommunityIcons name="whatsapp" size={22} color="#25D366" />
                      </IconBtn>
                    </View>
                  ) : null}
                </View>

                {live.map((b) => {
                  const look = statusLook(b.status)
                  return (
                    <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: colors.bg }}>
                      <MaterialCommunityIcons name="door-open" size={22} color={colors.pri} />
                      <View style={{ flex: 1 }}>
                        <T w="semibold" size={14} numberOfLines={1}>{b.property_name}</T>
                        <T size={13}>{t('room')} {b.room_no}{b.bed_label ? ` · ${t('bed')} ${b.bed_label}` : ''}</T>
                      </View>
                      <Badge label={t(look.key)} tone={look.tone} />
                    </View>
                  )
                })}

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {live.length === 0 ? <Badge label={x.bookings_count > 0 ? t('stOut') : t('noBooking')} tone="grey" /> : null}
                  <Badge label={x.ekyc_done ? t('ekycOk') : t('ekycPend')} tone={x.ekyc_done ? 'green' : 'amber'} />
                  {live.length > 0 ? <Badge label={allAgr ? t('agrOk') : t('agrPend')} tone={allAgr ? 'green' : 'amber'} /> : null}
                  {x.total_balance > 0 ? <Badge label={`${t('due')} ${inr(x.total_balance)}`} tone="red" /> : null}
                  {x.total_balance < 0 ? <Badge label={`${t('adv')} ${inr(-x.total_balance)}`} tone="green" /> : null}
                </View>
              </Card>
            </Pressable>
          )
        })
      )}
    </Screen>
  )
}
