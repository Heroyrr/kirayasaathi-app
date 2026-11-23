import React, { useRef, useState } from 'react'
import { Linking, View } from 'react-native'
import { Alert } from '../../ui/AppAlert'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import type { ComplaintRow, ComplaintStatus } from '../../api/types'
import { useAction } from '../../hooks/useAction'
import { useSettings } from '../../settings/SettingsProvider'
import { useGetComplaintQuery, useUpdateComplaintMutation } from '../../store/api/complaints'
import { useUploadFileMutation } from '../../store/api/files'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { IconButton } from '../../ui/IconButton'
import { PhotoStrip } from '../../ui/PhotoStrip'
import { PrivateImage } from '../../ui/PrivateImage'
import { Screen } from '../../ui/Screen'
import { T } from '../../ui/AppText'
import { TextField } from '../../ui/TextField'
import { COMPLAINT_STATUSES, complaintStatusLook } from '../../utils/complaintStatus'
import { showDate, toYmd } from '../../utils/dates'
import type { Picked } from '../../utils/pickImage'
import { Loader } from '../../ui/Loader'

const stamp = (iso: string) => {
  const d = new Date(iso)
  return `${showDate(toYmd(d))}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function Detail({ c }: { c: ComplaintRow }) {
  const { t, colors } = useSettings()
  const router = useRouter()
  const { busy, run } = useAction()
  const [update] = useUpdateComplaintMutation()
  const [uploadFile] = useUploadFileMutation()
  const [note, setNote] = useState('') // a NEW note; old ones stay in the list
  const [images, setImages] = useState<Picked[]>([])
  const [status, setStatus] = useState<ComplaintStatus>(c.status)
  const uploaded = useRef<Record<string, { file_key: string; mime_type: string }>>({})

  const where = [c.property.name, c.room ? `${t('room')} ${c.room.room_no}` : '', c.bed ? `${t('bed')} ${c.bed.label}` : ''].filter(Boolean).join(' · ')

  async function submit() {
    const r = await run(async () => {
      const files: { file_key: string; mime_type: string }[] = []
      for (const p of images) {
        if (!uploaded.current[p.uri]) {
          const up = await uploadFile({ uri: p.uri, kind: 'complaint', mime: p.mime }).unwrap()
          uploaded.current[p.uri] = { file_key: up.key, mime_type: up.mime_type }
        }
        files.push(uploaded.current[p.uri])
      }
      return update({
        id: c.id,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(files.length ? { files } : {}),
        status,
      }).unwrap()
    })
    if (r.ok) {
      Alert.alert(t('cpSaved'), undefined, undefined, { tone: 'success' })
      router.back()
    }
  }

  return (
    <>
      <Card>
        {c.tenant ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar name={c.tenant.name} id={c.tenant.id} photoKey={c.tenant.photo_key} size={60} />
            <View style={{ flex: 1, gap: 4 }}>
              <T w="bold" size={16}>{c.tenant.name}</T>
              <T size={12.5} color={colors.muted}>{c.tenant.phone ? `+91 ${c.tenant.phone}` : '—'}</T>
              {c.tenant.phone ? (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <IconButton tint={colors.pri} onPress={() => Linking.openURL(`tel:${c.tenant?.phone}`)}>
                    <Feather name="phone" size={18} color={colors.pri} />
                  </IconButton>
                  <IconButton tint="#25D366" onPress={() => Linking.openURL(`https://wa.me/91${c.tenant?.phone}`)}>
                    <MaterialCommunityIcons name="whatsapp" size={22} color="#25D366" />
                  </IconButton>
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: `${colors.pri}22`, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="office-building-outline" size={28} color={colors.pri} />
            </View>
            <View style={{ flex: 1 }}>
              <T w="bold" size={16}>{c.property.name}</T>
              <T size={12.5} color={colors.muted}>{t('cpCommon')}</T>
            </View>
          </View>
        )}
        <T size={12.5} color={colors.muted} style={{ marginTop: 10 }}>{where}</T>

        <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
          <T w="medium" size={12} color={colors.muted}>{t('cpText')} · {stamp(c.created_at)}</T>
          <T w="semibold" size={15} style={{ marginTop: 2 }}>{c.service}</T>
          {c.description ? <T size={14} color={colors.muted} style={{ marginTop: 6, lineHeight: 20 }}>{c.description}</T> : null}
          {(c.files ?? []).length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {(c.files ?? []).map((f) => <PrivateImage key={f.id} fileKey={f.file_key} />)}
            </View>
          ) : null}
        </View>
      </Card>

      <Card>
        <T w="bold" size={14} style={{ marginBottom: 6 }}>{t('cpNotes')}</T>
        {(c.notes ?? []).length === 0 ? (
          <T size={13} color={colors.muted} style={{ marginBottom: 12 }}>{t('noEntries')}</T>
        ) : (
          <View style={{ marginBottom: 12 }}>
            {(c.notes ?? []).map((n, i) => (
              <View key={n.id} style={{ paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.line }}>
                <T size={11.5} color={colors.muted}>{stamp(n.created_at)}</T>
                <T size={14} style={{ marginTop: 2 }}>{n.text}</T>
                {n.files.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {n.files.map((f) => <PrivateImage key={f.id} fileKey={f.file_key} size={64} />)}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}

        <TextField label={t('cpAddNote')} value={note} onChangeText={setNote} placeholder={t('cpNotePh')} multiline />
        <PhotoStrip label={t('cpImages')} value={images} onChange={setImages} />

        <T w="medium" size={12.5} color={colors.muted} style={{ marginBottom: 6 }}>{t('cpStatus')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {COMPLAINT_STATUSES.map((s) => (
            <Chip key={s} label={t(complaintStatusLook(s).key)} active={status === s} onPress={() => setStatus(s)} />
          ))}
        </View>
      </Card>

      <Button title={t('submitL')} onPress={submit} loading={busy} />
    </>
  )
}

export default function ComplaintDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t, colors, errText } = useSettings()
  const q = useGetComplaintQuery(id)
  return (
    <Screen title={t('complaint')} back>
      {q.isLoading ? (
        <Loader />
      ) : q.isError || !q.data ? (
        <Card>
          <T color={colors.red} style={{ marginBottom: 12 }}>{errText(q.error)}</T>
          <Button title={t('retry')} onPress={() => q.refetch()} />
        </Card>
      ) : (
        <Detail key={q.data.id} c={q.data} />
      )}
    </Screen>
  )
}
