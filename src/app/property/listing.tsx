import React, { useRef, useState } from 'react'
import { Image, Pressable, ScrollView, View } from 'react-native'
import { Alert } from '../../ui/AppAlert'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import type { PropertyDetail } from '../../api/types'
import { listingPhotoUrl } from '../../api/client'
import { useAction } from '../../hooks/useAction'
import { usePickPhotos } from '../../hooks/usePickPhoto'
import { useSettings } from '../../settings/SettingsProvider'
import { useUploadListingPhotoMutation } from '../../store/api/files'
import { useGetPropertyQuery, useSetLiveMutation, useUpdateListingMutation } from '../../store/api/properties'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { Loader } from '../../ui/Loader'
import { Screen } from '../../ui/Screen'
import { T } from '../../ui/AppText'
import { TextField } from '../../ui/TextField'
import { inr } from '../../utils/format'
import { LocationStep } from '../../features/properties/LocationStep'
import { AMENITIES, UNIT_TYPES, detailsMissing, listingLabel, listingMissing, locationBody, locationMissing, placeLine, type LocationForm } from '../../utils/listing'
import { pinText } from '../../utils/location'
import type { Key } from '../../i18n/strings'

const MAX_PHOTOS = 8
const toggle = (list: string[], k: string) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k])

/**
 * Going live on RoomIndeed, in 3 steps:
 *   1. Details   (photos, rent, deposit, type, amenities)
 *   2. Location  (pincode, city, locality, address, map pin) -> Confirm location
 *   3. Verify    (the owner sees everything) -> Verify and go live
 * A property that is already live shows details and location together on one page.
 */
function ListingForm({ p, toTop }: { p: PropertyDetail; toTop: () => void }) {
  const { t, colors, lang } = useSettings()
  const router = useRouter()
  const { busy, run } = useAction()
  const pick = usePickPhotos()
  const [uploadPhoto] = useUploadListingPhotoMutation()
  const [updateListing] = useUpdateListingMutation()
  const [setLive] = useSetLiveMutation()

  // smallest category rent is the starting point for "minimum monthly rent"
  const lowestRent = p.categories.length ? Math.min(...p.categories.map((c) => c.rent)) : null
  const [step, setStepRaw] = useState<1 | 2 | 3>(1)
  const setStep = (n: 1 | 2 | 3) => { setStepRaw(n); toTop() }
  const [photos, setPhotos] = useState<string[]>(p.photo_keys ?? [])
  const [uploading, setUploading] = useState(false)
  const [loc, setLoc] = useState<LocationForm>({
    pincode: p.pincode ?? '', state: p.state ?? '', city: p.city ?? '', locality: p.locality ?? '',
    address: p.address ?? '', landmark: p.landmark ?? '', lat: p.lat ?? null, lng: p.lng ?? null,
  })
  const patchLoc = (patch: Partial<LocationForm>) => setLoc((l) => ({ ...l, ...patch }))
  const [rent, setRent] = useState(p.min_rent != null ? String(p.min_rent) : lowestRent != null ? String(lowestRent) : '')
  const [deposit, setDeposit] = useState(p.security_deposit != null ? String(p.security_deposit) : '')
  const [amenities, setAmenities] = useState<string[]>(p.amenities ?? [])
  // keep only the types that fit this property (bed property: hostel / pg, otherwise 1BHK etc.)
  const allowed = UNIT_TYPES[p.type]
  const [types, setTypes] = useState<string[]>((p.unit_types ?? []).filter((k) => allowed.some((a) => a.key === k)).slice(0, 1))

  const detailsIn = { photos: photos.length, rent, deposit, types: types.length, units: p.units }
  const dMissing = detailsMissing(detailsIn)
  const lMissing = locationMissing(loc)
  const missing = listingMissing(detailsIn, loc)
  const detailsBody = () => ({
    id: p.id,
    min_rent: Number(rent),
    security_deposit: Number(deposit),
    amenities,
    unit_types: types,
    photo_keys: photos,
  })
  const body = () => ({ ...detailsBody(), ...locationBody(loc) })
  const showMissing = (list: string[]) =>
    Alert.alert(t('error'), `${t('lstMissing')}: ${list.map((m) => t(`miss_${m}` as Key)).join(', ')}`, undefined, { tone: 'warning' })

  const addPhoto = async () => {
    const room = MAX_PHOTOS - photos.length
    if (room <= 0) return
    const picked = await pick(room)
    if (!picked.length) return
    setUploading(true)
    let failed = false
    // upload one by one, keep the ones that worked
    for (const ph of picked) {
      try {
        const up = await uploadPhoto({ uri: ph.uri, mime: ph.mime }).unwrap()
        setPhotos((list) => (list.length >= MAX_PHOTOS ? list : [...list, up.key]))
      } catch (e) {
        if (!failed) Alert.alert(t('error'), (e as { message?: string })?.message ?? '', undefined, { tone: 'error' })
        failed = true
      }
    }
    setUploading(false)
  }

  // live property: save changes, it stays live (the database checks it is still complete)
  const saveLive = async () => {
    if (missing.length) { showMissing(missing); return }
    const r = await run(() => updateListing(body()).unwrap())
    if (r.ok) { Alert.alert(t('lstSaved'), undefined, undefined, { tone: 'success' }); router.back() }
  }

  // step 1 -> 2: save the details as a draft, then ask for the location
  const toLocation = async () => {
    if (dMissing.length) { showMissing(dMissing); return }
    const r = await run(() => updateListing(detailsBody()).unwrap())
    if (r.ok) setStep(2)
  }

  // step 2 -> 3: confirm the location (saved as a draft), then the verify page
  const toVerify = async () => {
    if (lMissing.length) { showMissing(lMissing); return }
    const r = await run(() => updateListing(body()).unwrap())
    if (r.ok) setStep(3)
  }

  const confirmLive = async () => {
    const r = await run(() => setLive({ id: p.id, live: true }).unwrap())
    if (r.ok) { Alert.alert(t('lstLiveDone'), undefined, undefined, { tone: 'success' }); router.back() }
  }

  const goOffline = () =>
    Alert.alert(t('takeOffline'), t('offlineQ'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('takeOffline'), style: 'destructive', onPress: async () => { const r = await run(() => setLive({ id: p.id, live: false }).unwrap()); if (r.ok) router.back() } },
    ])

  const photoRow = (editable: boolean) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
      {editable && photos.length < MAX_PHOTOS ? (
        <Pressable
          onPress={uploading ? undefined : addPhoto}
          style={{ width: 84, height: 84, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}
        >
          {uploading ? <Loader inline /> : <Feather name="plus" size={24} color={colors.muted} />}
        </Pressable>
      ) : null}
      {photos.map((k, i) => (
        <View key={k}>
          <Image source={{ uri: listingPhotoUrl(k) }} style={{ width: editable ? 84 : 150, height: editable ? 84 : 110, borderRadius: 10, backgroundColor: colors.line }} />
          {editable ? (
            <Pressable onPress={() => setPhotos((l) => l.filter((_, j) => j !== i))} hitSlop={8} style={{ position: 'absolute', top: -6, right: -6, backgroundColor: colors.card, borderRadius: 11 }}>
              <Feather name="x-circle" size={22} color={colors.red} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </ScrollView>
  )

  /* ------------------------------------------------ step 3: verify */
  if (step === 3) {
    const editLink = (label: string, to: 1 | 2) => (
      <Pressable onPress={() => setStep(to)} hitSlop={8}>
        <T w="semibold" size={12.5} color={colors.pri}>{label}</T>
      </Pressable>
    )
    return (
      <>
        <T w="semibold" size={13} color={colors.muted} style={{ marginBottom: 6 }}>{t('stepVerify')}</T>
        <T w="bold" size={15} style={{ marginBottom: 2 }}>{t('verifyT')}</T>
        <T size={12.5} color={colors.muted} style={{ marginBottom: 10 }}>{t('verifyH')}</T>

        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <T w="bold" size={13} color={colors.muted}>{t('lstDetails')}</T>
            {editLink(t('editL'), 1)}
          </View>
          {photoRow(false)}
          <T w="bold" size={17} style={{ marginTop: 10 }}>{p.name}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {types.map((k) => <Badge key={k} label={listingLabel(k, lang)} tone="green" />)}
          </View>
          <View style={{ flexDirection: 'row', gap: 20, marginTop: 12 }}>
            <View>
              <T size={11.5} color={colors.muted}>{t('minRentL').replace(/\s*\(.*$/, '')}</T>
              <T w="bold" size={16}>{inr(Number(rent))}</T>
            </View>
            <View>
              <T size={11.5} color={colors.muted}>{t('depositL2').replace(/\s*\(.*$/, '')}</T>
              <T w="bold" size={16}>{inr(Number(deposit))}</T>
            </View>
          </View>
          {amenities.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {amenities.map((k) => <Badge key={k} label={listingLabel(k, lang)} tone="grey" />)}
            </View>
          ) : null}
        </Card>

        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <T w="bold" size={13} color={colors.muted}>{t('locationL')}</T>
            {editLink(t('editL'), 2)}
          </View>
          <T w="semibold" size={14.5}>{placeLine(loc)}</T>
          {loc.state.trim() ? <T size={12.5} color={colors.muted}>{loc.state.trim()}</T> : null}
          <T size={13} style={{ marginTop: 6 }}>{loc.address.trim()}</T>
          {loc.landmark.trim() ? <T size={12.5} color={colors.muted} style={{ marginTop: 2 }}>{t('landmarkL').replace(/\s*\(.*$/, '')}: {loc.landmark.trim()}</T> : null}
          {loc.lat != null && loc.lng != null ? (
            <T w="semibold" size={12.5} color={colors.green} style={{ marginTop: 8 }}>{t('pinSet')}: {pinText(loc.lat, loc.lng)}</T>
          ) : null}
        </Card>

        <Button title={t('verifyLive')} onPress={confirmLive} loading={busy} />
        <View style={{ height: 10 }} />
        <Button title={t('backEdit')} variant="ghost" onPress={() => setStep(2)} disabled={busy} />
      </>
    )
  }

  /* ------------------------------------------------ step 2: location */
  if (step === 2 && !p.is_live) {
    return (
      <>
        <T w="semibold" size={13} color={colors.muted} style={{ marginBottom: 10 }}>{t('stepLocation')}</T>
        <LocationStep value={loc} onChange={patchLoc} />
        {lMissing.length ? (
          <T size={12.5} color={colors.amber} style={{ marginBottom: 10 }}>{t('lstMissing')}: {lMissing.map((m) => t(`miss_${m}` as Key)).join(', ')}</T>
        ) : null}
        <Button title={t('confirmLocation')} onPress={toVerify} loading={busy} />
        <View style={{ height: 10 }} />
        <Button title={t('backEdit')} variant="ghost" onPress={() => setStep(1)} disabled={busy} />
      </>
    )
  }

  /* ------------------------------------------------ step 1: details (a live property also shows the location here) */
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <T w="semibold" size={13} color={colors.muted}>{p.is_live ? t('liveOn') : t('stepDetails')}</T>
        <Badge label={p.is_live ? t('liveOn') : t('liveOff')} tone={p.is_live ? 'green' : 'amber'} />
      </View>

      <Card>
        <T w="bold" size={15}>{t('lstPhotos')}</T>
        <T size={12} color={colors.muted} style={{ marginBottom: 8 }}>{t('lstPhotosH')}</T>
        {photoRow(true)}
      </Card>

      <Card>
        <T w="bold" size={15} style={{ marginBottom: 10 }}>{t('lstDetails')}</T>
        <TextField label={t('minRentL')} value={rent} onChangeText={setRent} keyboardType="numeric" />
        <TextField label={t('depositL2')} value={deposit} onChangeText={setDeposit} keyboardType="numeric" />
      </Card>

      <Card>
        <T w="bold" size={15}>{t('unitTypesL')}</T>
        <T size={12} color={colors.muted} style={{ marginBottom: 8 }}>{p.type === 'BED' ? t('unitTypesBedH') : t('unitTypesNonH')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {allowed.map((a) => <Chip key={a.key} label={a[lang]} active={types.includes(a.key)} onPress={() => setTypes([a.key])} />)}
        </View>
      </Card>

      <Card>
        <T w="bold" size={15} style={{ marginBottom: 8 }}>{t('amenitiesL')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {AMENITIES.map((a) => <Chip key={a.key} label={a[lang]} active={amenities.includes(a.key)} onPress={() => setAmenities((l) => toggle(l, a.key))} />)}
        </View>
      </Card>

      {p.is_live ? <LocationStep value={loc} onChange={patchLoc} /> : null}

      {p.is_live ? (
        <>
          {missing.length ? (
            <T size={12.5} color={colors.amber} style={{ marginBottom: 10 }}>{t('lstMissing')}: {missing.map((m) => t(`miss_${m}` as Key)).join(', ')}</T>
          ) : null}
          <Button title={t('save')} onPress={saveLive} loading={busy} />
          <View style={{ height: 10 }} />
          <Button title={t('takeOffline')} variant="danger" onPress={goOffline} disabled={busy} />
        </>
      ) : (
        <>
          {dMissing.length ? (
            <T size={12.5} color={colors.amber} style={{ marginBottom: 10 }}>{t('lstMissing')}: {dMissing.map((m) => t(`miss_${m}` as Key)).join(', ')}</T>
          ) : null}
          <Button title={t('nextLocation')} onPress={toLocation} loading={busy} />
        </>
      )}
    </>
  )
}

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t, colors, errText } = useSettings()
  const q = useGetPropertyQuery(id, { skip: !id })
  const scrollRef = useRef<ScrollView>(null)
  return (
    <Screen title={t('liveT')} sub={q.data?.name} back scrollRef={scrollRef}>
      {q.isLoading ? (
        <Loader />
      ) : q.isError || !q.data ? (
        <Card>
          <T color={colors.red} style={{ marginBottom: 12 }}>{errText(q.error)}</T>
          <Button title={t('retry')} onPress={() => q.refetch()} />
        </Card>
      ) : (
        <ListingForm key={q.data.id} p={q.data} toTop={() => scrollRef.current?.scrollTo({ y: 0, animated: false })} />
      )}
    </Screen>
  )
}
