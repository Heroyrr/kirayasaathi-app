import React, { useState } from 'react'
import { Linking, Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import type { ComplaintStatus } from '../../api/types'
import { useSettings } from '../../settings/SettingsProvider'
import { useGetComplaintsQuery } from '../../store/api/complaints'
import { useGetPropertiesQuery } from '../../store/api/properties'
import { Avatar } from '../../ui/Avatar'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { EmptyState } from '../../ui/EmptyState'
import { Fab } from '../../ui/Fab'
import { IconButton } from '../../ui/IconButton'
import { Screen } from '../../ui/Screen'
import { SelectField } from '../../ui/SelectField'
import { T } from '../../ui/AppText'
import { COMPLAINT_STATUSES, complaintStatusLook } from '../../utils/complaintStatus'
import { currentMonth, monthLabel, shiftMonth, showDate, toYmd } from '../../utils/dates'
import { Loader } from '../../ui/Loader'

export default function SupportScreen() {
  const { t, colors, errText } = useSettings()
  const router = useRouter()
  const [status, setStatus] = useState<ComplaintStatus>('pending') // pending first
  const [month, setMonth] = useState(currentMonth())
  const [propertyId, setPropertyId] = useState(0) // 0 = all properties
  const isNow = month >= currentMonth()

  const props = useGetPropertiesQuery()
  const q = useGetComplaintsQuery({ status, month, ...(propertyId ? { property_id: propertyId } : {}) })
  const counts = q.data?.counts
  const list = q.data?.complaints ?? []
  const propOptions = [{ id: 0, label: t('cpAllProps') }, ...(props.data ?? []).map((p) => ({ id: p.id, label: p.name }))]

  return (
    <Screen
      title={t('m2')}
      back
      refreshing={q.isFetching && !q.isLoading}
      onRefresh={() => q.refetch()}
      fab={<Fab onPress={() => router.push('/support/new' as any)} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Pressable onPress={() => setMonth(shiftMonth(month, -1))} hitSlop={10} style={{ padding: 8 }}>
          <Feather name="chevron-left" size={22} color={colors.pri} />
        </Pressable>
        <T w="bold" size={16}>{monthLabel(month)}</T>
        <Pressable onPress={() => !isNow && setMonth(shiftMonth(month, 1))} hitSlop={10} style={{ padding: 8, opacity: isNow ? 0.3 : 1 }}>
          <Feather name="chevron-right" size={22} color={colors.pri} />
        </Pressable>
      </View>

      {(props.data?.length ?? 0) > 1 ? (
        <SelectField value={propertyId} options={propOptions} onChange={(id) => setPropertyId(Number(id))} />
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {COMPLAINT_STATUSES.map((s) => (
          <Chip key={s} label={`${t(complaintStatusLook(s).key)} (${counts?.[s] ?? 0})`} active={status === s} onPress={() => setStatus(s)} />
        ))}
      </View>

      {q.isLoading ? (
        <Loader />
      ) : q.isError ? (
        <Card>
          <T color={colors.red} style={{ marginBottom: 12 }}>{errText(q.error)}</T>
          <Button title={t('retry')} onPress={() => q.refetch()} />
        </Card>
      ) : list.length === 0 ? (
        <EmptyState icon="tools" title={t('cpNone')} sub={t('cpNoneH')} />
      ) : (
        list.map((c) => {
          const st = complaintStatusLook(c.status)
          const where = [c.property.name, c.room ? `${t('room')} ${c.room.room_no}` : '', c.bed ? `${t('bed')} ${c.bed.label}` : ''].filter(Boolean).join(' · ')
          return (
            <Pressable key={c.id} onPress={() => router.push(`/support/${c.id}` as any)}>
              <Card>
                {c.tenant ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Avatar name={c.tenant.name} id={c.tenant.id} photoKey={c.tenant.photo_key} size={44} />
                    <View style={{ flex: 1 }}>
                      <T w="bold" size={14.5} numberOfLines={1}>{c.tenant.name}</T>
                      {c.tenant.phone ? <T size={12} color={colors.muted}>+91 {c.tenant.phone}</T> : null}
                    </View>
                    {c.tenant.phone ? (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <IconButton size={36} tint={colors.pri} onPress={() => Linking.openURL(`tel:${c.tenant?.phone}`)}>
                          <Feather name="phone" size={16} color={colors.pri} />
                        </IconButton>
                        <IconButton size={36} tint="#25D366" onPress={() => Linking.openURL(`https://wa.me/91${c.tenant?.phone}`)}>
                          <MaterialCommunityIcons name="whatsapp" size={20} color="#25D366" />
                        </IconButton>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${colors.pri}22`, alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialCommunityIcons name="office-building-outline" size={22} color={colors.pri} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T w="bold" size={14.5} numberOfLines={1}>{c.property.name}</T>
                      <T size={12} color={colors.muted}>{t('cpCommon')}</T>
                    </View>
                  </View>
                )}
                {c.tenant ? <T size={12.5} color={colors.muted} style={{ marginTop: 8 }} numberOfLines={1}>{where}</T> : null}
                <T w="semibold" size={14} style={{ marginTop: 8 }} numberOfLines={2}>{c.service}</T>
                {c.description ? <T size={12.5} color={colors.muted} style={{ marginTop: 2 }} numberOfLines={2}>{c.description}</T> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                  <Badge label={t(st.key)} tone={st.tone} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {c.files_count > 0 ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Feather name="image" size={14} color={colors.muted} />
                        <T size={12} color={colors.muted}>{c.files_count}</T>
                      </View>
                    ) : null}
                    <T size={12} color={colors.muted}>{showDate(toYmd(new Date(c.created_at)))}</T>
                  </View>
                </View>
              </Card>
            </Pressable>
          )
        })
      )}
    </Screen>
  )
}
