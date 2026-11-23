import React, { useState } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Alert } from '../../ui/AppAlert'
import { useAction } from '../../hooks/useAction'
import { useSettings } from '../../settings/SettingsProvider'
import { useGetHomeQuery } from '../../store/api/home'
import { useAddCategoryMutation, useAddPropertyMutation } from '../../store/api/properties'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { Screen } from '../../ui/Screen'
import { Segmented } from '../../ui/Segmented'
import { T } from '../../ui/AppText'
import { TextField } from '../../ui/TextField'
import { countRooms } from '../../utils/rooms'

type PType = 'BED' | 'NON_BED'
const isNum = (v: string) => v.trim() !== '' && !Number.isNaN(Number(v))

/**
 * Add a property (and its first category) on its own page.
 * It used to be a pop-up sheet: the keyboard opening and closing resized the pop-up and it flickered.
 * A normal page does not have that problem.
 */
export default function NewProperty() {
  const { t, colors, errText, lang } = useSettings()
  const router = useRouter()
  const { busy, run } = useAction()
  const [addProperty] = useAddPropertyMutation()
  const [addCategory] = useAddCategoryMutation()
  const home = useGetHomeQuery()
  const sub = home.data?.subscription

  const [name, setName] = useState('')
  const [type, setType] = useState<PType>('NON_BED')
  const [catKind, setCatKind] = useState<'NON_AC' | 'AC' | 'CUSTOM'>('NON_AC') // Non AC is selected by default
  const [customName, setCustomName] = useState('')
  const [rent, setRent] = useState('')
  const [beds, setBeds] = useState('3')
  const [rooms, setRooms] = useState('')

  // the first category is required, so the property can always go live
  const catName = catKind === 'AC' ? 'AC' : catKind === 'NON_AC' ? 'Non AC' : customName.trim()
  const bedsOk = type === 'NON_BED' || (Number(beds) >= 1 && Number(beds) <= 26)
  const valid = name.trim() !== '' && catName !== '' && isNum(rent) && rooms.trim() !== '' && bedsOk

  // units left on the plan (the server checks this too; here we only warn before anything is saved)
  const unitsLeft = sub && sub.unit_limit != null ? Math.max(0, sub.unit_limit - sub.used_units) : null

  async function submit() {
    // the property limit: stop here so a property is never created without its rooms
    if (sub && sub.property_limit != null && sub.used_properties >= sub.property_limit) {
      Alert.alert(t('error'), t('err_PROPERTY_LIMIT'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('choose'), onPress: () => router.replace('/plans' as any) },
      ], { tone: 'warning' })
      return
    }
    // the unit limit: rooms (or rooms x beds) must fit in what is left
    if (unitsLeft != null) {
      const count = countRooms(rooms)
      const need = count == null ? 0 : count * (type === 'BED' ? Number(beds) : 1)
      if (need > unitsLeft) {
        Alert.alert(t('error'), t('unitsLeftErr', { n: unitsLeft }), undefined, { tone: 'warning' })
        return
      }
    }

    const r = await run(async () => {
      const prop = await addProperty({ name: name.trim(), type }).unwrap()
      let catError = ''
      try {
        await addCategory({
          propertyId: prop.id, name: catName.trim(), rent: Number(rent), rooms: rooms.trim(),
          ...(type === 'BED' ? { beds_per_room: Number(beds) } : {}),
        }).unwrap()
      } catch (e) {
        catError = errText(e)
      }
      return { id: prop.id, catError }
    })
    if (r.ok) {
      if (r.data.catError) Alert.alert(t('error'), t('catPartial') + r.data.catError, undefined, { tone: 'warning' })
      // replace, so Back from the new property goes to the list and not to this form
      router.replace(`/property/${r.data.id}` as any)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title={t('addProp')} back>
        <Card>
          <TextField label={t('propName')} value={name} onChangeText={setName} autoCapitalize="words" />
          <T w="medium" size={12.5} color={colors.muted} style={{ marginBottom: 6 }}>{t('ptype')}</T>
          <Segmented<PType>
            value={type}
            onChange={setType}
            options={[{ v: 'NON_BED', label: t('pNonT') }, { v: 'BED', label: t('pBedT') }]}
          />
          <T size={12} color={colors.muted} style={{ marginTop: 6 }}>{type === 'BED' ? t('pBedH') : t('pNonH')}</T>
        </Card>

        <Card>
          <T w="bold" size={14} style={{ marginBottom: 8 }}>{t('firstCat')}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <Chip label={lang === 'hi' ? 'नॉन AC' : 'Non AC'} active={catKind === 'NON_AC'} onPress={() => setCatKind('NON_AC')} />
            <Chip label="AC" active={catKind === 'AC'} onPress={() => setCatKind('AC')} />
            <Chip label={lang === 'hi' ? '+ कस्टम' : '+ Custom'} active={catKind === 'CUSTOM'} onPress={() => setCatKind('CUSTOM')} />
          </View>
          {catKind === 'CUSTOM' ? <TextField label={t('catName')} value={customName} onChangeText={setCustomName} /> : null}
          <TextField label={t('rent')} value={rent} onChangeText={setRent} keyboardType="numeric" />
          {type === 'BED' ? <TextField label={t('bedsPer')} value={beds} onChangeText={setBeds} keyboardType="number-pad" maxLength={2} /> : null}
          <TextField label={t('roomNos')} value={rooms} onChangeText={setRooms} placeholder="101-110" autoCapitalize="characters" />
          <T size={12} color={colors.muted} style={{ marginTop: -6 }}>{t('roomNosH')}</T>
          {unitsLeft != null ? (
            <T w="semibold" size={12} color={colors.amber} style={{ marginTop: 6 }}>{t('unitsLeftH', { n: unitsLeft })}</T>
          ) : null}
        </Card>

        <Button title={t('create')} onPress={submit} loading={busy} disabled={!valid} />
      </Screen>
    </KeyboardAvoidingView>
  )
}
