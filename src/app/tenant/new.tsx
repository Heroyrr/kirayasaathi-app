import React, { useRef, useState } from 'react'
import { Image, Pressable, Switch, View } from 'react-native'
import { Alert } from '../../ui/AppAlert'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { RoomPicker, type Slot } from '../../features/bookings/RoomPicker'
import { useAction } from '../../hooks/useAction'
import { usePickPhoto } from '../../hooks/usePickPhoto'
import { useSettings } from '../../settings/SettingsProvider'
import { useAddBookingMutation } from '../../store/api/bookings'
import { useUploadFileMutation } from '../../store/api/files'
import { useAddInvoiceMutation } from '../../store/api/invoices'
import { useAddTenantDocumentMutation, useAddTenantMutation, useGetTenantQuery } from '../../store/api/tenants'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { DateField } from '../../ui/DateField'
import { Screen } from '../../ui/Screen'
import { MonthPicker } from '../../ui/MonthPicker'
import { T } from '../../ui/AppText'
import { TextField } from '../../ui/TextField'
import { addDays, monthPeriodEnd, periodForMonth, prorateRent, PRORATE_DAYS, todayYmd } from '../../utils/dates'
import { cleanPhone, inr } from '../../utils/format'
import type { Picked } from '../../utils/pickImage'

type Kind = 'aadhaar_front' | 'aadhaar_back' | 'other_id'

/** One ID proof: shows the chosen image and lets you pick or remove it */
function DocPick({ label, value, onPick, onClear }: { label: string; value?: Picked; onPick: () => void; onClear: () => void }) {
  const { colors, t } = useSettings()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      {value ? (
        <Image source={{ uri: value.uri }} style={{ width: 52, height: 52, borderRadius: 8 }} />
      ) : (
        <View style={{ width: 52, height: 52, borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="image" size={20} color={colors.muted} />
        </View>
      )}
      <T w="medium" size={14} style={{ flex: 1 }}>{label}</T>
      {value ? (
        <Pressable onPress={onClear} hitSlop={8}><Feather name="x-circle" size={22} color={colors.red} /></Pressable>
      ) : (
        <Button title={t('upload')} variant="ghost" onPress={onPick} style={{ height: 38, paddingHorizontal: 14 }} />
      )}
    </View>
  )
}

export default function NewTenant() {
  const { tenantId, reserve } = useLocalSearchParams<{ tenantId?: string; reserve?: string }>()
  const { t, colors, errText } = useSettings()
  const router = useRouter()
  const { busy, run } = useAction()
  const pick = usePickPhoto()
  const [uploadFile] = useUploadFileMutation()
  const [addTenant] = useAddTenantMutation()
  const [addDoc] = useAddTenantDocumentMutation()
  const [addBooking] = useAddBookingMutation()
  const [addInvoice] = useAddInvoiceMutation()

  // Always a new tenant. The only exception is "new booking" opened from a tenant's own page.
  // If the mobile number already belongs to a tenant who is still staying, the server says: move them out first.
  const pickedId = tenantId ? Number(tenantId) : undefined
  const isExisting = !!pickedId
  const existing = useGetTenantQuery(pickedId as number, { skip: !isExisting })
  const hasLive = !!existing.data?.bookings.some((b) => b.status !== 'moved_out')

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [photo, setPhoto] = useState<Picked | undefined>()
  const [docs, setDocs] = useState<Partial<Record<Kind, Picked>>>({})
  const [slot, setSlot] = useState<Slot>({})
  // the start date is the moving-in date: a future date makes it a reservation, today or earlier is moving in now
  const [start, setStart] = useState(reserve === '1' ? addDays(todayYmd(), 1) : todayYmd())
  const [end, setEnd] = useState('')
  const [deposit, setDeposit] = useState('')
  const [advance, setAdvance] = useState('')
  const status: 'active' | 'reserved' = start > todayYmd() ? 'reserved' : 'active'

  // first invoice, made together with the booking. Empty field = use the default shown.
  const [makeInv, setMakeInv] = useState(true)
  const [invStart, setInvStart] = useState('')
  const [invEnd, setInvEnd] = useState('')
  const [invRent, setInvRent] = useState('')
  const invStartEff = invStart || start
  const invEndEff = invEnd || monthPeriodEnd(invStartEff)
  // a part of a month is charged as monthly rent / 30 x days (8000 / 30 x 14); a full rent month is the full rent
  const pro = slot.rent !== undefined && invEndEff >= invStartEff ? prorateRent(slot.rent, invStartEff, invEndEff) : null
  const invRentEff = invRent !== '' ? invRent : pro ? String(pro.amount) : slot.rent !== undefined ? String(slot.rent) : ''
  const invRentN = invRentEff.trim() === '' || Number.isNaN(Number(invRentEff)) ? null : Number(invRentEff)
  const invOk = !makeInv || (invRentN !== null && invRentN >= 0 && invEndEff >= invStartEff)
  const depositN = Number(deposit || 0) || 0
  const advanceN = Number(advance || 0) || 0
  const invTotal = (invRentN ?? 0) + depositN // security deposit is a line on this invoice, like the rent
  const payable = Math.max(0, invTotal - advanceN)

  // what was already saved, so a retry after an error never creates the same tenant or file twice
  const saved = useRef<{ tenantId?: number; photoKey?: string; docs: Partial<Record<Kind, boolean>> }>({ docs: {} })

  const digits = cleanPhone(phone)
  const phoneOk = phone.trim() === '' || /^[6-9]\d{9}$/.test(digits)
  const personOk = isExisting ? !!pickedId && !!existing.data && !hasLive : name.trim() !== '' && phoneOk
  const slotOk = !!slot.roomId && (!slot.isBed || !!slot.bedId)
  const numsOk = (deposit === '' || !Number.isNaN(Number(deposit))) && (advance === '' || !Number.isNaN(Number(advance)))
  const valid = personOk && slotOk && !!start && numsOk && (!end || end >= start) && invOk
  const [tried, setTried] = useState(false)
  // the first thing that is wrong, in plain words
  const problem =
    !isExisting && name.trim() === '' ? t('errName')
    : !isExisting && !phoneOk ? t('errPhone')
    : isExisting && hasLive ? t('anotherBooking')
    : !slot.roomId ? t('errRoomSel')
    : slot.isBed && !slot.bedId ? t('errBedSel')
    : end && end < start ? t('errEndDate')
    : !numsOk ? t('errNums')
    : makeInv && invRentN === null ? t('errRentF')
    : makeInv && invEndEff < invStartEff ? t('errInvDates')
    : ''

  const setDoc = (k: Kind) => async () => {
    const p = await pick()
    if (p) setDocs((d) => ({ ...d, [k]: p }))
  }
  const clearDoc = (k: Kind) => () => setDocs((d) => ({ ...d, [k]: undefined }))

  async function submit() {
    const r = await run(async () => {
      let tid = isExisting ? pickedId : saved.current.tenantId
      let newPerson = false
      if (!tid) {
        let photoKey = saved.current.photoKey
        if (photo && !photoKey) {
          photoKey = (await uploadFile({ uri: photo.uri, kind: 'photo', mime: photo.mime }).unwrap()).key
          saved.current.photoKey = photoKey
        }
        const created = await addTenant({ name: name.trim(), ...(digits ? { phone: digits } : {}), ...(photoKey ? { photo_key: photoKey } : {}) }).unwrap()
        tid = created.id
        saved.current.tenantId = tid
        newPerson = true
      }
      try {
        for (const kind of ['aadhaar_front', 'aadhaar_back', 'other_id'] as const) {
          const p = docs[kind]
          if (p && !saved.current.docs[kind]) {
            const up = await uploadFile({ uri: p.uri, kind, mime: p.mime }).unwrap()
            await addDoc({ tenantId: tid, kind, file_key: up.key, mime_type: up.mime_type }).unwrap()
            saved.current.docs[kind] = true
          }
        }
        const b = await addBooking({
          tenant_id: tid,
          room_id: slot.roomId as number,
          ...(slot.bedId ? { bed_id: slot.bedId } : {}),
          start_date: start,
          ...(end ? { end_date: end } : {}),
          status,
          deposit: Number(deposit || 0),
          advance: Number(advance || 0),
        }).unwrap()

        // the booking is saved; now the first invoice for the chosen date range
        let invoiceId: number | undefined
        let invoiceError = ''
        if (makeInv && invRentN !== null) {
          try {
            const inv = await addInvoice({
              bookingId: b.id,
              period_start: invStartEff,
              period_end: invEndEff,
              rent: invRentN,
              ...(depositN > 0 ? { extras: [{ name: t('secDepName'), amount: depositN }] } : {}),
              ...(advanceN > 0 ? { apply_advance: true } : {}),
            }).unwrap()
            invoiceId = inv.id
          } catch (e) {
            invoiceError = errText(e)
          }
        }
        return { bookingId: b.id, invoiceId, invoiceError }
      } catch (e) {
        // the person is saved: say so, so the owner can just fix the booking and press Save again
        if (newPerson || saved.current.tenantId) throw { message: t('tenantSavedPartial') + errText(e) }
        throw e
      }
    })
    if (r.ok) {
      if (r.data.invoiceError) Alert.alert(t('error'), t('invFailed') + r.data.invoiceError, undefined, { tone: 'warning' })
      router.replace((r.data.invoiceId ? `/invoice/${r.data.invoiceId}` : `/booking/${r.data.bookingId}`) as any)
    }
  }

  const title = isExisting ? t('newBooking') : status === 'reserved' ? t('resv') : t('newTenant')

  return (
    <Screen title={title} sub={isExisting && existing.data ? `${t('existingTenant')}: ${existing.data.name}` : undefined} back>
      {isExisting && pickedId ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <T w="bold" size={15}>{existing.data?.name ?? t('loading')}</T>
              {existing.data?.phone ? <T size={12.5} color={colors.muted}>+91 {existing.data.phone}</T> : null}
            </View>
          </View>
          {hasLive ? <T size={12.5} color={colors.red} style={{ marginTop: 8 }}>{t('anotherBooking')}</T> : null}
        </Card>
      ) : null}

      {!isExisting ? (
        <Card>
          <T w="bold" size={15} style={{ marginBottom: 10 }}>{t('person')}</T>
          <TextField label={t('tName')} value={name} onChangeText={setName} autoCapitalize="words" error={tried && name.trim() === '' ? t('errName') : ''} />
          <TextField label={t('tPhone')} prefix="+91" value={phone} onChangeText={setPhone} keyboardType="number-pad" maxLength={14} error={tried && !phoneOk ? t('errPhone') : ''} />
          <T w="bold" size={14} style={{ marginTop: 4, marginBottom: 2 }}>{t('idProofs')}</T>
          <DocPick label={t('profilePhoto')} value={photo} onPick={async () => { const p = await pick(); if (p) setPhoto(p) }} onClear={() => setPhoto(undefined)} />
          <DocPick label={t('aadFront')} value={docs.aadhaar_front} onPick={setDoc('aadhaar_front')} onClear={clearDoc('aadhaar_front')} />
          <DocPick label={t('aadBack')} value={docs.aadhaar_back} onPick={setDoc('aadhaar_back')} onClear={clearDoc('aadhaar_back')} />
          <DocPick label={t('otherId')} value={docs.other_id} onPick={setDoc('other_id')} onClear={clearDoc('other_id')} />
        </Card>
      ) : null}

      <Card>
        <T w="bold" size={15} style={{ marginBottom: 10 }}>{t('stay')}</T>
        <T w="medium" size={12.5} color={colors.muted} style={{ marginBottom: 6 }}>{t('selRoom')}</T>
        <RoomPicker value={slot} onChange={setSlot} />
        {slot.rent !== undefined ? (
          <T w="semibold" size={13.5} color={colors.green} style={{ marginBottom: 12 }}>{t('rentIs', { n: inr(slot.rent) })}</T>
        ) : null}
        <DateField label={t('startDate')} value={start} onChange={setStart} />
        <DateField label={t('endDate')} value={end} onChange={setEnd} clearable minDate={start} />
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T w="bold" size={15} style={{ flex: 1 }}>{t('mkInv')}</T>
          <Switch value={makeInv} onValueChange={setMakeInv} trackColor={{ true: colors.btn, false: colors.line }} />
        </View>
        <View style={{ marginTop: 12 }}>
          <TextField label={t('deposit')} value={deposit} onChangeText={setDeposit} keyboardType="numeric" />
          <TextField label={t('advancePay')} value={advance} onChangeText={setAdvance} keyboardType="numeric" />
        </View>
        {makeInv ? (
          <View>
            <MonthPicker
              label={t('invMonth')}
              value={invStartEff.slice(0, 7)}
              onChange={(m) => { const p = periodForMonth(m, start); setInvStart(p.start); setInvEnd(p.end); setInvRent('') }}
            />
            <T w="medium" size={12.5} color={colors.muted} style={{ marginBottom: 6 }}>{t('invPeriod')}</T>
            <DateField label={t('fromDate')} value={invStartEff} onChange={(v) => { setInvStart(v); setInvRent('') }} />
            <DateField label={t('toDate')} value={invEndEff} onChange={(v) => { setInvEnd(v); setInvRent('') }} minDate={invStartEff} />
            <TextField label={t('invRentL')} value={invRentEff} onChangeText={setInvRent} keyboardType="numeric" />
            {pro && slot.rent !== undefined && invRentN === pro.amount ? (
              <T w="semibold" size={13} color={pro.full ? colors.muted : colors.green} style={{ marginTop: -6, marginBottom: 10 }}>
                {pro.full ? t('proFull') : t('proRent', { d: pro.days, m: inr(slot.rent), b: PRORATE_DAYS, r: inr(pro.amount) })}
              </T>
            ) : null}
            <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T size={13} color={colors.muted}>{t('invTotalL')}{depositN > 0 ? ` (${t('invRentL').replace(/\s*\(.*$/, '')} + ${t('secDepName')})` : ''}</T>
                <T w="semibold" size={13}>{inr(invTotal)}</T>
              </View>
              {advanceN > 0 ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <T size={13} color={colors.muted}>{t('advancePay').replace(/\s*\(.*$/, '')}</T>
                  <T w="semibold" size={13} color={colors.green}>− {inr(advanceN)}</T>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T w="bold" size={14}>{t('payableL')}</T>
                <T w="bold" size={14} color={colors.red}>{inr(payable)}</T>
              </View>
            </View>
          </View>
        ) : null}
      </Card>

      {tried && problem ? <T w="semibold" size={13} color={colors.red} style={{ marginBottom: 10 }}>{problem}</T> : null}
      <Button
        title={t('saveBooking')}
        loading={busy}
        onPress={() => {
          if (!valid || problem) { setTried(true); Alert.alert(t('error'), problem || t('errNums'), undefined, { tone: 'error' }); return }
          submit()
        }}
      />
    </Screen>
  )
}
