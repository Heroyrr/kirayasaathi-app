import React, { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import type { LeadStatus } from '../../api/types'
import { useSettings } from '../../settings/SettingsProvider'
import { useGetLeadsQuery } from '../../store/api/leads'
import { Avatar } from '../../ui/Avatar'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { DateField } from '../../ui/DateField'
import { EmptyState } from '../../ui/EmptyState'
import { Fab } from '../../ui/Fab'
import { Screen } from '../../ui/Screen'
import { T } from '../../ui/AppText'
import { TextField } from '../../ui/TextField'
import { showDate } from '../../utils/dates'
import { LEAD_STATUSES, leadStatusLook } from '../../utils/leadStatus'
import { Loader } from '../../ui/Loader'

const leadProps = (l: { properties?: { id: number; name: string }[]; property?: { id: number; name: string } | null }) =>
  l.properties?.length ? l.properties : l.property ? [l.property] : []

/** The website a lead came from ("RoomIndeed", "GharSaathi", a partner name). Leads added by hand in the app have none. */
const sourceName = (l: { source?: string; source_name?: string | null }) =>
  l.source_name ?? (l.source && l.source !== 'app' ? (l.source === 'roomindeed' ? 'RoomIndeed' : l.source) : null)

export default function LeadsScreen() {
  const { t, colors, errText } = useSettings()
  const router = useRouter()
  const [status, setStatus] = useState<LeadStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [date, setDate] = useState('') // next action date filter, "YYYY-MM-DD"

  useEffect(() => {
    const h = setTimeout(() => setDebounced(search.trim()), 350)
    return () => clearTimeout(h)
  }, [search])

  const q = useGetLeadsQuery({
    ...(status !== 'all' ? { status } : {}),
    ...(debounced ? { search: debounced } : {}),
    ...(date ? { date } : {}),
  })
  const counts = q.data?.counts
  const leads = q.data?.leads ?? []
  const label = (s: LeadStatus) => `${t(leadStatusLook(s).key)} (${counts?.[s] ?? 0})`

  return (
    <Screen
      title={t('leads')}
      back
      refreshing={q.isFetching && !q.isLoading}
      onRefresh={() => q.refetch()}
      fab={<Fab onPress={() => router.push('/leads/new' as any)} />}
    >
      <TextField value={search} onChangeText={setSearch} placeholder={t('searchLead')} autoCapitalize="none" />
      <DateField label={t('filterByDate')} value={date} onChange={setDate} clearable />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <Chip label={`${t('fAll')} (${counts?.total ?? 0})`} active={status === 'all'} onPress={() => setStatus('all')} />
        {LEAD_STATUSES.map((s) => (
          <Chip key={s} label={label(s)} active={status === s} onPress={() => setStatus(s)} />
        ))}
      </View>

      {q.isLoading ? (
        <Loader />
      ) : q.isError ? (
        <Card>
          <T color={colors.red} style={{ marginBottom: 12 }}>{errText(q.error)}</T>
          <Button title={t('retry')} onPress={() => q.refetch()} />
        </Card>
      ) : leads.length === 0 ? (
        <EmptyState icon="account-search-outline" title={t('noLeads')} sub={t('noLeadsH')} />
      ) : (
        leads.map((l) => {
          const st = leadStatusLook(l.status)
          return (
            <Pressable key={l.id} onPress={() => router.push(`/leads/${l.id}` as any)}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <Avatar name={l.name} id={l.id} size={44} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <View>
                      <T w="bold" size={14.5} numberOfLines={1}>{l.name}</T>
                      {l.phone ? <T size={12} color={colors.muted}>+91 {l.phone}</T> : null}
                    </View>
                    {leadProps(l).length ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {leadProps(l).map((x) => (
                          <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.line, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                            <Feather name="home" size={11} color={colors.muted} />
                            <T size={11.5} color={colors.text} numberOfLines={1}>{x.name}</T>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {sourceName(l) ? <Badge label={t('fromSrc', { name: sourceName(l)! })} tone="green" /> : null}
                  </View>
                  <Badge label={t(st.key)} tone={st.tone} />
                </View>
                {l.next_action || l.next_action_at ? (
                  <T size={12.5} color={colors.muted} style={{ marginTop: 10 }} numberOfLines={2}>
                    {t('nextOn')}: {l.next_action ?? ''}{l.next_action && l.next_action_at ? ' · ' : ''}{l.next_action_at ? showDate(l.next_action_at) : ''}
                  </T>
                ) : null}
              </Card>
            </Pressable>
          )
        })
      )}
    </Screen>
  )
}
