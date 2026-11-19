import React, { useState } from 'react'
import { View } from 'react-native'
import { Alert } from '../../ui/AppAlert'
import { useAction } from '../../hooks/useAction'
import { useSettings } from '../../settings/SettingsProvider'
import { useAddPaymentMutation } from '../../store/api/payments'
import { Button } from '../../ui/Button'
import { DateField } from '../../ui/DateField'
import { Segmented } from '../../ui/Segmented'
import { Sheet } from '../../ui/Sheet'
import { T } from '../../ui/AppText'
import { TextField } from '../../ui/TextField'
import { todayYmd } from '../../utils/dates'
import { inr } from '../../utils/format'

/** Record a payment. The server puts it on the oldest unpaid invoice first; any extra becomes advance. */
export function PaymentSheet({
  bookingId, defaultAmount, tenantName, onClose, onDone,
}: { bookingId: number; defaultAmount?: number; tenantName?: string; onClose: () => void; onDone?: () => void }) {
  const { t, colors } = useSettings()
  const { busy, run } = useAction()
  const [addPayment] = useAddPaymentMutation()
  const [amount, setAmount] = useState(defaultAmount && defaultAmount > 0 ? String(defaultAmount) : '')
  const [mode, setMode] = useState<'cash' | 'upi' | 'bank'>('cash')
  const [ref, setRef] = useState('')
  const [paidOn, setPaidOn] = useState(todayYmd())
  const amt = Number(amount)
  const valid = amount.trim() !== '' && !Number.isNaN(amt) && amt > 0 && ref.trim() !== '' && !!paidOn

  async function submit() {
    const r = await run(() => addPayment({ booking_id: bookingId, mode, amount: amt, ref_no: ref.trim(), paid_on: paidOn }).unwrap())
    if (r.ok) {
      if (r.data.to_advance > 0) Alert.alert(t('payRecorded'), t('toAdvance', { n: inr(r.data.to_advance) }), undefined, { tone: 'success' })
      onDone?.()
      onClose()
    }
  }

  return (
    <Sheet title={t('recPay')} onClose={onClose}>
      {tenantName ? <T w="semibold" size={14} color={colors.muted} style={{ marginBottom: 10 }}>{tenantName}</T> : null}
      <TextField label={t('amountL')} value={amount} onChangeText={setAmount} keyboardType="numeric" autoFocus />
      <T w="medium" size={12.5} color={colors.muted} style={{ marginBottom: 6 }}>{t('payMode')}</T>
      <Segmented<'cash' | 'upi' | 'bank'>
        value={mode}
        onChange={setMode}
        options={[{ v: 'cash', label: t('mCash') }, { v: 'upi', label: t('mUpi') }, { v: 'bank', label: t('mBank') }]}
      />
      <View style={{ height: 12 }} />
      <TextField label={t('refNo')} value={ref} onChangeText={setRef} autoCapitalize="characters" />
      <DateField label={t('paidOn')} value={paidOn} onChange={setPaidOn} />
      <Button title={t('save')} onPress={submit} loading={busy} disabled={!valid} />
    </Sheet>
  )
}
