import React from 'react'
import { View } from 'react-native'
import type { PaymentRow } from '../../api/types'
import { useAction } from '../../hooks/useAction'
import { useSettings } from '../../settings/SettingsProvider'
import { Button } from '../../ui/Button'
import { KeyValue } from '../../ui/KeyValue'
import { Sheet } from '../../ui/Sheet'
import { showDate } from '../../utils/dates'
import { inr } from '../../utils/format'
import { receiptOnWhatsApp, shareReceiptPdf } from './shareReceipt'

export function PaymentDetail({ p, onClose }: { p: PaymentRow; onClose: () => void }) {
  const { t } = useSettings()
  const { busy, run } = useAction()
  const b = p.booking
  return (
    <Sheet title={t('payDetail')} onClose={onClose}>
      <KeyValue label={t('tenantL')} value={b?.tenant?.name ?? '—'} />
      <KeyValue label={t('mobileL')} value={b?.tenant?.phone ? `+91 ${b.tenant.phone}` : '—'} />
      <KeyValue label={t('selProp')} value={b?.property?.name ?? '—'} />
      <KeyValue label={t('roomNoL')} value={`${b?.room?.room_no ?? '—'}${b?.bed ? ` · ${t('bed')} ${b.bed.label}` : ''}`} />
      <KeyValue label={t('dateL')} value={showDate(p.paid_on)} />
      <KeyValue label={t('modeL')} value={p.mode.toUpperCase()} />
      <KeyValue label={t('refL')} value={p.ref_no ?? '—'} />
      <KeyValue label={t('amountL')} value={inr(p.amount)} bold />
      <View style={{ height: 14 }} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title={t('rcptWa')} variant="ghost" onPress={() => receiptOnWhatsApp(p)} style={{ flex: 1 }} />
        <Button title={t('rcptPdf')} variant="ghost" loading={busy} onPress={() => run(() => shareReceiptPdf(p))} style={{ flex: 1 }} />
      </View>
    </Sheet>
  )
}
