import React, { useState } from 'react'
import { useRouter } from 'expo-router'
import { useAction } from '../../hooks/useAction'
import { useSettings } from '../../settings/SettingsProvider'
import { useAddLeadMutation } from '../../store/api/leads'
import { useGetPropertiesQuery } from '../../store/api/properties'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Screen } from '../../ui/Screen'
import { SelectField } from '../../ui/SelectField'
import { TextField } from '../../ui/TextField'
import { cleanPhone } from '../../utils/format'

export default function NewLead() {
  const { t } = useSettings()
  const router = useRouter()
  const { busy, run } = useAction()
  const [addLead] = useAddLeadMutation()
  const props = useGetPropertiesQuery()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [propertyId, setPropertyId] = useState<number | string | undefined>()
  const [note, setNote] = useState('')

  const digits = cleanPhone(phone)
  const [tried, setTried] = useState(false)
  const nameErr = name.trim() === '' ? t('errName') : ''
  const phoneErr = !/^[6-9]\d{9}$/.test(digits) ? t('errPhone') : ''

  async function submit() {
    if (nameErr || phoneErr) { setTried(true); return }
    const r = await run(() =>
      addLead({
        name: name.trim(),
        phone: digits,
        ...(propertyId ? { property_id: Number(propertyId) } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }).unwrap()
    )
    if (r.ok) router.replace(`/leads/${r.data.id}` as any)
  }

  const options = [{ id: 0, label: t('noneOpt') }, ...(props.data ?? []).map((p) => ({ id: p.id, label: p.name }))]

  return (
    <Screen title={t('newLead')} back>
      <Card>
        <TextField label={t('tName')} value={name} onChangeText={setName} autoCapitalize="words" error={tried ? nameErr : ''} />
        <TextField label={t('tPhone')} prefix="+91" value={phone} onChangeText={setPhone} keyboardType="number-pad" maxLength={14} error={tried ? phoneErr : ''} />
        <SelectField
          label={t('propSel')}
          value={propertyId ?? 0}
          options={options}
          onChange={(id) => setPropertyId(Number(id) || undefined)}
        />
        <TextField label={t('leadNote')} value={note} onChangeText={setNote} multiline />
      </Card>
      <Button title={t('save')} onPress={submit} loading={busy} />
    </Screen>
  )
}
