/*
| Step 2 of the Live flow: where is the property?
|   pincode -> state + city + area list (free pincode API)  ->  city and locality as dropdowns  ->  full address  ->  landmark
|   map pin: ONE button. It takes the current location, opens the map there, and the owner can move the pin.
| The parent keeps the values (so Back / Next keep them) and decides when they are saved.
*/
import React, { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { Alert } from '../../ui/AppAlert'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Loader } from '../../ui/Loader'
import { MapPinModal } from '../../ui/MapPinModal'
import { SelectField } from '../../ui/SelectField'
import { T } from '../../ui/AppText'
import { TextField } from '../../ui/TextField'
import { useSettings } from '../../settings/SettingsProvider'
import { lookupPincode } from '../../api/pincode'
import { LocationError, getCurrentPin, pinText } from '../../utils/location'
import { isPincode, type LocationForm } from '../../utils/listing'

type Status = 'idle' | 'loading' | 'ok' | 'notfound' | 'error'
const OTHER = '__other__'

/** A dropdown of the options, with "Other" to type your own. With no options it is a plain text box. */
function PickOrType({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const { t } = useSettings()
  const [other, setOther] = useState(false)
  const key = options.join('|')
  useEffect(() => { setOther(false) }, [key])

  if (options.length === 0) {
    return <TextField label={label} value={value} onChangeText={onChange} autoCapitalize="words" />
  }
  const match = options.find((o) => o.toLowerCase() === value.trim().toLowerCase())
  // a saved value that is not in the list is shown as "Other" with the text box
  const custom = other || (value.trim() !== '' && !match)
  return (
    <>
      <SelectField
        label={label}
        value={custom ? OTHER : match ?? null}
        options={[...options.map((o) => ({ id: o, label: o })), { id: OTHER, label: t('otherL') }]}
        onChange={(id) => {
          if (id === OTHER) { setOther(true); onChange('') } else { setOther(false); onChange(String(id)) }
        }}
      />
      {custom ? <TextField value={value} onChangeText={onChange} autoCapitalize="words" placeholder={label} /> : null}
    </>
  )
}

export function LocationStep({ value, onChange }: { value: LocationForm; onChange: (patch: Partial<LocationForm>) => void }) {
  const { t, colors } = useSettings()
  const [status, setStatus] = useState<Status>('idle')
  const [cities, setCities] = useState<string[]>([])
  const [areas, setAreas] = useState<string[]>([])
  const [mapOpen, setMapOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  // true once the owner types in the pincode box: only then the city and state are filled in for them
  // (a saved listing keeps what was saved, it only loads the dropdown lists)
  const typed = useRef(false)

  useEffect(() => {
    if (!isPincode(value.pincode)) {
      setStatus('idle')
      setCities([])
      setAreas([])
      return
    }
    let cancelled = false
    setStatus('loading')
    lookupPincode(value.pincode.trim())
      .then((info) => {
        if (cancelled) return
        if (!info) { setStatus('notfound'); setCities([]); setAreas([]); return }
        setStatus('ok')
        setCities(info.cities)
        setAreas(info.localities)
        if (typed.current) {
          onChange({
            state: info.state,
            city: info.city,
            // the old area belongs to the old pincode: clear it (or take the only one)
            locality: info.localities.length === 1 ? info.localities[0] : '',
          })
        }
      })
      .catch(() => { if (!cancelled) { setStatus('error'); setCities([]); setAreas([]) } })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.pincode])

  const hasPin = value.lat != null && value.lng != null

  // ONE button: take the current location (first time), show the map there, the owner moves the pin if needed
  const openMap = async () => {
    if (!hasPin) {
      setLocating(true)
      try {
        const p = await getCurrentPin()
        onChange({ lat: p.lat, lng: p.lng })
      } catch (e) {
        // no permission or no GPS: the map still opens, the owner puts the pin by hand
        const denied = e instanceof LocationError && e.code === 'DENIED'
        Alert.alert(t('error'), denied ? t('locDenied') : t('locFail'), undefined, { tone: 'warning' })
      } finally {
        setLocating(false)
      }
    }
    setMapOpen(true)
  }

  return (
    <>
      <Card>
        <T w="bold" size={15}>{t('locT')}</T>
        <T size={12} color={colors.muted} style={{ marginBottom: 10 }}>{t('locH')}</T>

        <TextField
          label={t('pincodeL')}
          value={value.pincode}
          onChangeText={(v) => { typed.current = true; onChange({ pincode: v.replace(/\D/g, '').slice(0, 6) }) }}
          keyboardType="number-pad"
          maxLength={6}
        />
        {status === 'loading' ? <Loader inline label={t('pinLookup')} /> : null}
        {status === 'notfound' ? <T size={12.5} color={colors.amber} style={{ marginTop: -6, marginBottom: 10 }}>{t('pinNotFound')}</T> : null}
        {status === 'error' ? <T size={12.5} color={colors.amber} style={{ marginTop: -6, marginBottom: 10 }}>{t('pinNet')}</T> : null}

        <PickOrType label={t('cityL')} value={value.city} options={cities} onChange={(v) => onChange({ city: v })} />
        <PickOrType label={t('localityL')} value={value.locality} options={areas} onChange={(v) => onChange({ locality: v })} />

        <TextField label={t('lstAddress')} value={value.address} onChangeText={(v) => onChange({ address: v })} multiline />
        <TextField label={t('landmarkL')} value={value.landmark} onChangeText={(v) => onChange({ landmark: v })} />
      </Card>

      <Card>
        <T w="bold" size={15}>{t('pinT')}</T>
        <T size={12} color={colors.muted} style={{ marginBottom: 10 }}>{t('pinH')}</T>
        <T w="semibold" size={13} color={hasPin ? colors.green : colors.amber} style={{ marginBottom: 10 }}>
          {hasPin ? `${t('pinSet')}: ${pinText(value.lat, value.lng)}` : t('pinNotSet')}
        </T>
        <Button title={t('choosePin')} onPress={openMap} loading={locating} />
      </Card>

      {mapOpen ? (
        <MapPinModal
          initial={hasPin ? { lat: value.lat as number, lng: value.lng as number } : null}
          onClose={() => setMapOpen(false)}
          onDone={(p) => { onChange({ lat: p.lat, lng: p.lng }); setMapOpen(false) }}
        />
      ) : null}
    </>
  )
}
