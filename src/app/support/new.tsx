import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { useRouter } from 'expo-router'
import { useAction } from '../../hooks/useAction'
import { useSettings } from '../../settings/SettingsProvider'
import { useAddComplaintMutation } from '../../store/api/complaints'
import { useUploadFileMutation } from '../../store/api/files'
import { useGetPropertiesQuery, useGetPropertyQuery } from '../../store/api/properties'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { PhotoStrip } from '../../ui/PhotoStrip'
import { Screen } from '../../ui/Screen'
import { Segmented } from '../../ui/Segmented'
import { SelectField } from '../../ui/SelectField'
import { T } from '../../ui/AppText'
import { TextField } from '../../ui/TextField'
import type { Picked } from '../../utils/pickImage'

type FileRef = { file_key: string; mime_type: string }

export default function NewComplaint() {
  const { t, colors } = useSettings()
  const router = useRouter()
  const { busy, run } = useAction()
  const [uploadFile] = useUploadFileMutation()
  const [addComplaint] = useAddComplaintMutation()

  const [kind, setKind] = useState<'tenant' | 'property'>('tenant')
  const [service, setService] = useState('')
  const [images, setImages] = useState<Picked[]>([])
  const [propertyId, setPropertyId] = useState<number | undefined>()
  const [roomId, setRoomId] = useState<number | undefined>()
  const [bedId, setBedId] = useState<number | undefined>()
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const uploaded = useRef<Record<string, FileRef>>({}) // so a retry never uploads the same photo twice

  const props = useGetPropertiesQuery()
  const detail = useGetPropertyQuery(propertyId as number, { skip: !propertyId || kind !== 'tenant' })
  const isBed = detail.data?.type === 'BED'

  // one property only: choose it for the owner
  useEffect(() => {
    if (!propertyId && props.data?.length === 1) setPropertyId(props.data[0].id)
  }, [props.data, propertyId])

  const rooms = useMemo(() => (detail.data?.categories ?? []).flatMap((c) => c.rooms).filter((r) => r.occupied), [detail.data])
  const room = rooms.find((r) => r.id === roomId)
  const roomOptions = rooms.map((r) => ({ id: r.id, label: `${r.room_no} · ${r.bookings.map((b) => b.tenant_name).join(', ')}` }))
  const bedOptions = (room?.beds ?? []).filter((b) => b.occupied).map((b) => ({ id: b.id, label: `${b.label} · ${b.booking?.tenant_name ?? ''}` }))

  const serviceErr = service.trim() === '' ? t('errComplaint') : ''
  const propErr = !propertyId ? t('errPropSel') : ''
  const roomErr = kind === 'tenant' && propertyId && !roomId ? t('errRoomSel') : ''
  const bedErr = kind === 'tenant' && isBed && roomId && !bedId ? t('errBedSel') : ''
  const problem = serviceErr || propErr || roomErr || bedErr

  async function upload(list: Picked[]): Promise<FileRef[]> {
    const out: FileRef[] = []
    for (const p of list) {
      if (!uploaded.current[p.uri]) {
        const up = await uploadFile({ uri: p.uri, kind: 'complaint', mime: p.mime }).unwrap()
        uploaded.current[p.uri] = { file_key: up.key, mime_type: up.mime_type }
      }
      out.push(uploaded.current[p.uri])
    }
    return out
  }

  async function submit() {
    if (problem) { setTried(true); return }
    const r = await run(async () => {
      const files = await upload(images) // photos belong to the description
      return addComplaint({
        kind,
        property_id: propertyId as number,
        ...(kind === 'tenant' ? { room_id: roomId, ...(bedId ? { bed_id: bedId } : {}) } : {}),
        service: service.trim(),
        ...(note.trim() ? { description: note.trim() } : {}),
        ...(files.length ? { files } : {}),
      }).unwrap()
    })
    if (r.ok) router.replace(`/support/${r.data.id}` as any)
  }

  const propOptions = (props.data ?? []).map((p) => ({ id: p.id, label: p.name }))
  const noTenants = kind === 'tenant' && propertyId && detail.data && rooms.length === 0

  return (
    <Screen title={t('complaint')} back>
      <Card>
        <T w="medium" size={12.5} color={colors.muted} style={{ marginBottom: 6 }}>{t('cpRelated')}</T>
        <View style={{ marginBottom: 14 }}>
          <Segmented<'tenant' | 'property'>
            value={kind}
            options={[{ v: 'tenant', label: t('cpTenant') }, { v: 'property', label: t('cpProp') }]}
            onChange={(v) => { setKind(v); setRoomId(undefined); setBedId(undefined) }}
          />
        </View>

        <TextField label={t('cpText')} value={service} onChangeText={setService} placeholder={t('cpTextPh')} error={tried ? serviceErr : ''} />

        <SelectField
          label={t('propSel')}
          value={propertyId}
          options={propOptions}
          onChange={(id) => { setPropertyId(Number(id)); setRoomId(undefined); setBedId(undefined) }}
        />
        {tried && propErr ? <T size={12} color={colors.red} style={{ marginTop: -8, marginBottom: 10 }}>{propErr}</T> : null}

        {kind === 'tenant' && propertyId ? (
          <>
            {noTenants ? (
              <T size={13} color={colors.muted} style={{ marginBottom: 12 }}>{t('noTenantsHere')}</T>
            ) : (
              <SelectField
                label={t('cpRoom')}
                value={roomId}
                options={roomOptions}
                onChange={(id) => { setRoomId(Number(id)); setBedId(undefined) }}
              />
            )}
            {tried && roomErr ? <T size={12} color={colors.red} style={{ marginTop: -8, marginBottom: 10 }}>{roomErr}</T> : null}
            {isBed && roomId ? (
              <SelectField label={t('cpBed')} value={bedId} options={bedOptions} onChange={(id) => setBedId(Number(id))} />
            ) : null}
            {tried && bedErr ? <T size={12} color={colors.red} style={{ marginTop: -8, marginBottom: 10 }}>{bedErr}</T> : null}
          </>
        ) : null}

        <TextField label={t('cpNote')} value={note} onChangeText={setNote} placeholder={t('cpNotePh')} multiline />
        <PhotoStrip label={t('cpImages')} value={images} onChange={setImages} />
      </Card>
      <Button title={t('submitL')} onPress={submit} loading={busy} />
    </Screen>
  )
}
