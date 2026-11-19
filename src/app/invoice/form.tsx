import React, { useState } from 'react'
import { Pressable, Switch, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import type { BookingDetail, InvoiceFull, InvoicePreview } from '../../api/types'
import { statusLook } from '../../features/bookings/status'
import { useAction } from '../../hooks/useAction'
import { useSettings } from '../../settings/SettingsProvider'
import { useGetBookingQuery, useGetBookingsQuery } from '../../store/api/bookings'
import {
  useAddInvoiceMutation, useGetInvoicePreviewQuery, useGetInvoiceQuery, useUpdateInvoiceMutation,
} from '../../store/api/invoices'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { DateField } from '../../ui/DateField'
import { EmptyState } from '../../ui/EmptyState'
import { KeyValue } from '../../ui/KeyValue'
import { MonthPicker } from '../../ui/MonthPicker'
import { Screen } from '../../ui/Screen'
import { T } from '../../ui/AppText'
import { TextField } from '../../ui/TextField'
import { addDays, monthPeriodEnd, periodForMonth, todayYmd } from '../../utils/dates'
import { inr } from '../../utils/format'

const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? null : Number(s))
const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))

type ExtraRow = { name: string; amount: string }

/** The form itself. It only mounts when all defaults are loaded, so the fields can start with their final values. */
function Form({ booking, preview, existing, month }: { booking: BookingDetail; preview?: InvoicePreview; existing?: InvoiceFull; month?: string }) {
  const { t, colors } = useSettings()
  const router = useRouter()
  const { busy, run } = useAction()
  const [addInvoice] = useAddInvoiceMutation()
  const [updateInvoice] = useUpdateInvoiceMutation()

  const nextStart = (preview?.last_period_end ? addDays(preview.last_period_end, 1) : booking.start_date) || todayYmd()
  // opened from the invoice list for a month with no invoice: start in that month
  const firstStart = month && /^\d{4}-\d{2}$/.test(month) && !existing ? periodForMonth(month, booking.start_date || undefined).start : nextStart
  const [periodStart, setPeriodStart] = useState(existing?.period_start ?? firstStart)
  const [periodEnd, setPeriodEnd] = useState(existing?.period_end ?? monthPeriodEnd(firstStart))
  const [rent, setRent] = useState(str(existing ? existing.rent : preview?.rent))
  const [startR, setStartR] = useState(str(existing ? existing.start_reading : preview?.start_reading))
  const [endR, setEndR] = useState(str(existing ? existing.end_reading : preview?.end_reading))
  const [rate, setRate] = useState(str(existing ? existing.rate : preview?.rate))
  const [split, setSplit] = useState(str(existing ? existing.split_count : preview?.split_count ?? 1))
  const [reset, setReset] = useState(false)
  const [extras, setExtras] = useState<ExtraRow[]>(existing?.items.map((i) => ({ name: i.name, amount: String(i.amount) })) ?? [])

  const rentN = num(rent)
  const startN = num(startR)
  const endN = num(endR)
  const rateN = num(rate)
  const splitN = Math.max(1, num(split) ?? 1)
  const hasReadings = startN !== null && endN !== null
  const units = hasReadings ? (endN as number) - (startN as number) : 0
  const lowerEnd = hasReadings && units < 0
  const electricity = hasReadings && rateN !== null ? Math.max(0, Math.round((units * rateN) / splitN)) : 0
  const cleanExtras = extras.filter((e) => e.name.trim() !== '' || e.amount.trim() !== '')
  const extrasOk = cleanExtras.every((e) => e.name.trim() !== '' && num(e.amount) !== null)
  const extrasSum = cleanExtras.reduce((s, e) => s + (num(e.amount) ?? 0), 0)
  const total = (rentN ?? 0) + electricity + extrasSum
  const previous = existing ? existing.previous_balance : booking.balance

  const valid = !!periodStart && !!periodEnd && periodEnd >= periodStart && rentN !== null && rentN >= 0 && extrasOk && (!lowerEnd || reset)

  const setExtra = (i: number, patch: Partial<ExtraRow>) => setExtras((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  async function submit() {
    const extrasBody = cleanExtras.map((e) => ({ name: e.name.trim(), amount: num(e.amount) as number }))
    const r = await run(async () => {
      if (existing) {
        // only send a reading when it changed, so an older invoice never adds a lower meter reading
        return updateInvoice({
          id: existing.id, period_start: periodStart, period_end: periodEnd, rent: rentN as number, split_count: splitN, extras: extrasBody,
          ...(rateN !== null ? { rate: rateN } : {}),
          ...(startN !== null && startN !== existing.start_reading ? { start_reading: startN } : {}),
          ...(endN !== null && endN !== existing.end_reading ? { end_reading: endN } : {}),
          ...(reset ? { meter_reset: true } : {}),
        }).unwrap()
      }
      return addInvoice({
        bookingId: booking.id, period_start: periodStart, period_end: periodEnd, rent: rentN as number, split_count: splitN, extras: extrasBody,
        ...(rateN !== null ? { rate: rateN } : {}),
        ...(startN !== null ? { start_reading: startN } : {}),
        ...(endN !== null ? { end_reading: endN } : {}),
        ...(reset ? { meter_reset: true } : {}),
      }).unwrap()
    })
    if (r.ok) router.replace(`/invoice/${r.data.id}` as any)
  }

  return (
    <>
      <Card>
        <T w="bold" size={15}>{booking.tenant?.name}</T>
        <T size={12.5} color={colors.muted}>
          {booking.property?.name} · {t('room')} {booking.room?.room_no}{booking.bed ? ` (${t('bed')} ${booking.bed.label})` : ''}
        </T>
      </Card>

      <Card>
        <T w="bold" size={15} style={{ marginBottom: 10 }}>{t('billPeriod')}</T>
        <MonthPicker
          label={t('invMonth')}
          value={periodStart.slice(0, 7)}
          onChange={(m) => { const p = periodForMonth(m, booking.start_date || undefined); setPeriodStart(p.start); setPeriodEnd(p.end) }}
        />
        <DateField label={t('fromDate')} value={periodStart} onChange={setPeriodStart} />
        <DateField label={t('toDate')} value={periodEnd} onChange={setPeriodEnd} minDate={periodStart} />
        <TextField label={`${t('rentL')} (₹)`} value={rent} onChangeText={setRent} keyboardType="numeric" />
      </Card>

      <Card>
        <T w="bold" size={15} style={{ marginBottom: 4 }}>{t('electricity')}</T>
        <T size={12} color={colors.muted} style={{ marginBottom: 10 }}>{t('readHint')}</T>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><TextField label={t('startRead')} value={startR} onChangeText={setStartR} keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><TextField label={t('endRead')} value={endR} onChangeText={setEndR} keyboardType="decimal-pad" /></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><TextField label={t('rateUnit')} value={rate} onChangeText={setRate} keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><TextField label={t('sharing')} value={split} onChangeText={setSplit} keyboardType="number-pad" maxLength={2} /></View>
        </View>
        {lowerEnd ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <T w="medium" size={13} color={colors.red} style={{ flex: 1, paddingRight: 10 }}>{t('meterReset')}</T>
            <Switch value={reset} onValueChange={setReset} trackColor={{ true: colors.btn, false: colors.line }} />
          </View>
        ) : null}
        {hasReadings && rateN === null ? <T size={12.5} color={colors.amber}>{t('needRate')}</T> : null}
        {hasReadings && rateN !== null ? (
          <T w="semibold" size={13.5} color={colors.green}>
            {t('unitsCalc', { n: Math.round(units * 100) / 100 })} × {inr(rateN)}{splitN > 1 ? ` ÷ ${splitN}` : ''} = {inr(electricity)}
          </T>
        ) : null}
      </Card>

      <Card>
        <T w="bold" size={15} style={{ marginBottom: 10 }}>{t('extras')}</T>
        {extras.map((e, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View style={{ flex: 2 }}><TextField placeholder={t('extraName')} value={e.name} onChangeText={(v) => setExtra(i, { name: v })} /></View>
            <View style={{ flex: 1 }}><TextField placeholder="₹" value={e.amount} onChangeText={(v) => setExtra(i, { amount: v })} keyboardType="numeric" /></View>
            <Pressable onPress={() => setExtras((rows) => rows.filter((_, idx) => idx !== i))} hitSlop={8} style={{ height: 52, justifyContent: 'center' }}>
              <Feather name="x-circle" size={22} color={colors.red} />
            </Pressable>
          </View>
        ))}
        <Button title={`+  ${t('addExtra')}`} variant="ghost" onPress={() => setExtras((rows) => [...rows, { name: '', amount: '' }])} />
      </Card>

      <Card>
        <KeyValue label={t('rentL')} value={inr(rentN ?? 0)} />
        {electricity > 0 ? <KeyValue label={t('electricity')} value={inr(electricity)} /> : null}
        {extrasSum > 0 ? <KeyValue label={t('extras')} value={inr(extrasSum)} /> : null}
        <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 6 }} />
        <KeyValue label={t('thisInvoice')} value={inr(total)} bold />
        {previous !== 0 ? <KeyValue label={t('prevBal')} value={`${previous < 0 ? '−' : ''}${inr(Math.abs(previous))}`} color={previous > 0 ? colors.red : colors.green} /> : null}
      </Card>

      <Button title={existing ? t('save') : t('createInv')} onPress={submit} loading={busy} disabled={!valid} />
    </>
  )
}

export default function InvoiceFormScreen() {
  const { bookingId: bookingParam, invoiceId, month } = useLocalSearchParams<{ bookingId?: string; invoiceId?: string; month?: string }>()
  const { t, colors, errText } = useSettings()
  const editing = !!invoiceId
  const [chosen, setChosen] = useState<string | undefined>(bookingParam)

  const existing = useGetInvoiceQuery(invoiceId as string, { skip: !editing })
  const bookingId = editing ? (existing.data ? String(existing.data.booking_id) : undefined) : chosen
  const booking = useGetBookingQuery(bookingId as string, { skip: !bookingId })
  const preview = useGetInvoicePreviewQuery(bookingId as string, { skip: !bookingId || editing })
  const live = useGetBookingsQuery({ status: 'live' }, { skip: editing || !!bookingId })

  const ready = !!booking.data && (editing ? !!existing.data : !!preview.data)
  const failed = booking.error ?? preview.error ?? existing.error

  return (
    <Screen title={editing ? t('editInv') : t('createInv')} sub={editing ? existing.data?.number : undefined} back>
      {!editing && !bookingId ? (
        <>
          <T w="bold" size={15} style={{ marginBottom: 10 }}>{t('chooseBooking')}</T>
          {live.isLoading ? <T color={colors.muted}>{t('loading')}</T> : null}
          {live.data && live.data.length === 0 ? <EmptyState icon="account-off-outline" title={t('noLive')} /> : null}
          {live.data?.map((b) => {
            const look = statusLook(b.status)
            return (
              <Pressable key={b.id} onPress={() => setChosen(String(b.id))}>
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <T w="bold" size={15} style={{ flex: 1 }} numberOfLines={1}>{b.tenant?.name}</T>
                    <Badge label={t(look.key)} tone={look.tone} />
                  </View>
                  <T size={12.5} color={colors.muted}>{b.property?.name} · {t('room')} {b.room?.room_no}{b.bed ? ` (${t('bed')} ${b.bed.label})` : ''}</T>
                </Card>
              </Pressable>
            )
          })}
        </>
      ) : failed ? (
        <Card>
          <T color={colors.red}>{errText(failed)}</T>
        </Card>
      ) : !ready ? (
        <T color={colors.muted} style={{ textAlign: 'center', marginTop: 40 }}>{t('loading')}</T>
      ) : (
        <Form booking={booking.data as BookingDetail} preview={preview.data} existing={editing ? existing.data : undefined} month={month} />
      )}
    </Screen>
  )
}
