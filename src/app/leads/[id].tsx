import React, { useState } from 'react'
import { Linking, View } from 'react-native'
import { Alert } from '../../ui/AppAlert'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import type { Lead, LeadStatus } from '../../api/types'
import { useAction } from '../../hooks/useAction'
import { useSettings } from '../../settings/SettingsProvider'
import { useGetLeadQuery, useUpdateLeadMutation } from '../../store/api/leads'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { DateField } from '../../ui/DateField'
import { IconButton } from '../../ui/IconButton'
import { Screen } from '../../ui/Screen'
import { T } from '../../ui/AppText'
import { TextField } from '../../ui/TextField'
import { showDate, toYmd } from '../../utils/dates'
import { LEAD_STATUSES, leadStatusLook } from '../../utils/leadStatus'
import { Loader } from '../../ui/Loader'
import { MultiSelectField } from '../../ui/MultiSelectField'
import { useGetPropertiesQuery } from '../../store/api/properties'

const stamp = (iso: string) => {
  const d = new Date(iso)
  return `${showDate(toYmd(d))}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function LeadForm({ lead }: { lead: Lead }) {
  const { t, colors } = useSettings()
  const router = useRouter()
  const { busy, run } = useAction()
  const [update] = useUpdateLeadMutation()
  const props = useGetPropertiesQuery()
  const [propIds, setPropIds] = useState<(number | string)[]>((lead.properties ?? (lead.property ? [lead.property] : [])).map((x) => x.id))
  const [lastTalk, setLastTalk] = useState('') // a NEW entry; old ones stay in the history
  const [nextAction, setNextAction] = useState('') // a NEW entry
  const [nextDate, setNextDate] = useState(lead.next_action_at ?? '')
  const [status, setStatus] = useState<LeadStatus>(lead.status)
  const [tried, setTried] = useState(false)

  const shown = lead.properties?.length ? lead.properties : lead.property ? [lead.property] : []
  const talks = (lead.logs ?? []).filter((g) => g.kind === 'talk')
  const nexts = (lead.logs ?? []).filter((g) => g.kind === 'next')
  const dateErr = nextAction.trim() !== '' && !nextDate ? t('errNextDate') : ''

  async function submit() {
    if (dateErr) { setTried(true); return }
    const r = await run(() =>
      update({
        id: lead.id,
        ...(lastTalk.trim() ? { last_talk: lastTalk.trim() } : {}),
        ...(nextAction.trim() ? { next_action: nextAction.trim() } : {}),
        next_action_at: nextDate, // empty string clears it
        property_ids: propIds.map(Number),
        status,
      }).unwrap()
    )
    if (r.ok) {
      Alert.alert(t('leadSaved'), undefined, undefined, { tone: 'success' })
      router.back()
    }
  }

  const History = ({ title, items, showDue }: { title: string; items: typeof talks; showDue?: boolean }) => (
    <View style={{ marginBottom: 12 }}>
      <T w="bold" size={14} style={{ marginBottom: 6 }}>{title}</T>
      {items.length === 0 ? (
        <T size={13} color={colors.muted}>{t('noEntries')}</T>
      ) : (
        items.map((g, i) => (
          <View key={g.id} style={{ paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
            <T size={11.5} color={colors.muted}>{stamp(g.created_at)}</T>
            <T size={14} style={{ marginTop: 2 }}>{g.text}</T>
            {showDue && g.due_date ? (
              <T w="semibold" size={12.5} color={colors.pri} style={{ marginTop: 2 }}>{t('dueOn')}: {showDate(g.due_date)}</T>
            ) : null}
          </View>
        ))
      )}
    </View>
  )

  return (
    <>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={lead.name} id={lead.id} size={60} />
          <View style={{ flex: 1, gap: 4 }}>
            <T w="bold" size={16}>{lead.name}</T>
            <T size={12.5} color={colors.muted}>{lead.phone ? `+91 ${lead.phone}` : '—'}</T>
            {lead.phone ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <IconButton tint={colors.pri} onPress={() => Linking.openURL(`tel:${lead.phone}`)}>
                  <Feather name="phone" size={18} color={colors.pri} />
                </IconButton>
                <IconButton tint="#25D366" onPress={() => Linking.openURL(`https://wa.me/91${lead.phone}`)}>
                  <MaterialCommunityIcons name="whatsapp" size={22} color="#25D366" />
                </IconButton>
              </View>
            ) : null}
          </View>
        </View>
        {shown.length ? (
          <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
            <T w="medium" size={12} color={colors.muted}>{t('leadProps')}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {shown.map((x) => (
                <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.line, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 }}>
                  <Feather name="home" size={12} color={colors.pri} />
                  <T w="medium" size={13}>{x.name}</T>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        {lead.note ? (
          <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
            <T w="medium" size={12} color={colors.muted}>{t('leadNote')}</T>
            <T size={14} style={{ marginTop: 2 }}>{lead.note}</T>
          </View>
        ) : null}
      </Card>

      <Card>
        <MultiSelectField
          label={t('leadProps')}
          hint={t('leadPropsH')}
          values={propIds}
          options={(props.data ?? []).map((p) => ({ id: p.id, label: p.name }))}
          onChange={setPropIds}
        />
      </Card>

      <Card>
        <History title={t('talkHistory')} items={talks} />
        <TextField label={t('addTalk')} value={lastTalk} onChangeText={setLastTalk} placeholder={t('writeTalk')} multiline />
      </Card>

      <Card>
        <History title={t('nextHistory')} items={nexts} showDue />
        <TextField label={t('addNext')} value={nextAction} onChangeText={setNextAction} placeholder={t('writeNext')} multiline />
        <DateField label={t('nextActDate')} value={nextDate} onChange={setNextDate} clearable />
        {tried && dateErr ? <T size={12} color={colors.red} style={{ marginTop: -6, marginBottom: 8 }}>{dateErr}</T> : null}

        <T w="medium" size={12.5} color={colors.muted} style={{ marginTop: 4, marginBottom: 6 }}>{t('leadStatus')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {LEAD_STATUSES.map((s) => (
            <Chip key={s} label={t(leadStatusLook(s).key)} active={status === s} onPress={() => setStatus(s)} />
          ))}
        </View>
      </Card>

      <Button title={t('submitL')} onPress={submit} loading={busy} />
    </>
  )
}

export default function LeadDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t, colors, errText } = useSettings()
  const q = useGetLeadQuery(id)
  return (
    <Screen title={q.data?.name ?? t('leads')} back>
      {q.isLoading ? (
        <Loader />
      ) : q.isError || !q.data ? (
        <Card>
          <T color={colors.red} style={{ marginBottom: 12 }}>{errText(q.error)}</T>
          <Button title={t('retry')} onPress={() => q.refetch()} />
        </Card>
      ) : (
        <LeadForm key={q.data.id} lead={q.data} />
      )}
    </Screen>
  )
}
