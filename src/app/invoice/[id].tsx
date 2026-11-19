import React, { useState } from 'react'
import { View } from 'react-native'
import { Alert } from '../../ui/AppAlert'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { PaymentSheet } from '../../features/billing/PaymentSheet'
import { invoiceState } from '../../features/billing/invoiceState'
import { shareInvoicePdf, shareOnWhatsApp } from '../../features/billing/shareInvoice'
import { useAuth } from '../../auth/AuthProvider'
import { useAction } from '../../hooks/useAction'
import { useSettings } from '../../settings/SettingsProvider'
import { useCancelInvoiceMutation, useGetInvoiceQuery } from '../../store/api/invoices'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { KeyValue } from '../../ui/KeyValue'
import { Screen } from '../../ui/Screen'
import { T } from '../../ui/AppText'
import { showDate } from '../../utils/dates'
import { inr } from '../../utils/format'

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t, colors, errText } = useSettings()
  const router = useRouter()
  const { user } = useAuth()
  const { busy, run } = useAction()
  const q = useGetInvoiceQuery(id, { skip: !id })
  const [cancelInvoice] = useCancelInvoiceMutation()
  const [paying, setPaying] = useState(false)
  const inv = q.data

  const cancel = () =>
    Alert.alert(t('cancelInv'), t('cancelInvQ'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('cancelInv'), style: 'destructive', onPress: () => { run(() => cancelInvoice(inv!.id).unwrap()) } },
    ])

  const st = inv ? invoiceState(inv) : null
  const where = inv ? `${inv.booking.property?.name} · ${t('room')} ${inv.booking.room?.room_no}${inv.booking.bed ? ` (${t('bed')} ${inv.booking.bed.label})` : ''}` : ''

  return (
    <Screen title={inv?.number ?? t('invNo')} sub={inv?.booking.tenant?.name} back refreshing={q.isFetching && !q.isLoading} onRefresh={() => q.refetch()}>
      {q.isLoading ? (
        <T color={colors.muted} style={{ textAlign: 'center', marginTop: 40 }}>{t('loading')}</T>
      ) : q.isError || !inv || !st ? (
        <Card>
          <T color={colors.red} style={{ marginBottom: 12 }}>{errText(q.error)}</T>
          <Button title={t('retry')} onPress={() => q.refetch()} />
        </Card>
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T w="bold" size={16} style={{ flex: 1 }} numberOfLines={1}>{inv.booking.tenant?.name}</T>
              <Badge label={t(st.key)} tone={st.tone} />
            </View>
            <T size={12.5} color={colors.muted} style={{ marginTop: 2 }}>{where}</T>
            <T size={12.5} color={colors.muted}>{showDate(inv.period_start)} → {showDate(inv.period_end)}</T>
          </Card>

          <Card>
            <KeyValue label={t('rentL')} value={inr(inv.rent)} />
            {inv.electricity > 0 || (inv.start_reading !== null && inv.end_reading !== null) ? (
              <View>
                <KeyValue label={t('electricity')} value={inr(inv.electricity)} />
                {inv.start_reading !== null && inv.end_reading !== null ? (
                  <T size={11.5} color={colors.muted} style={{ marginTop: -2, marginBottom: 4 }}>
                    ({inv.end_reading} − {inv.start_reading}){inv.rate !== null ? ` × ${inr(inv.rate)}` : ''}{inv.split_count > 1 ? ` ÷ ${inv.split_count}` : ''}
                  </T>
                ) : null}
              </View>
            ) : null}
            {inv.items.map((i) => <KeyValue key={i.id} label={i.name} value={inr(i.amount)} />)}
            <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 6 }} />
            <KeyValue label={t('totalL')} value={inr(inv.total)} bold />
            <KeyValue label={t('paid')} value={inr(inv.paid)} color={colors.green} />
            <KeyValue label={t('dueL')} value={inr(inv.due)} color={inv.due > 0 ? colors.red : colors.muted} bold />
            {!inv.cancelled && inv.previous_balance !== 0 ? (
              <>
                <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 6 }} />
                <KeyValue label={inv.previous_balance > 0 ? t('prevDueL') : t('advAdjL')} value={`${inv.previous_balance < 0 ? '− ' : '+ '}${inr(Math.abs(inv.previous_balance))}`} color={inv.previous_balance > 0 ? colors.red : colors.green} />
                <KeyValue
                  label={inv.previous_balance + inv.due < 0 ? t('advBalL') : t('finalPayL')}
                  value={inr(Math.abs(inv.previous_balance + inv.due))}
                  color={inv.previous_balance + inv.due < 0 ? colors.green : colors.red}
                  bold
                />
              </>
            ) : null}
          </Card>

          <View style={{ gap: 10 }}>
            {!inv.cancelled ? <Button title={t('recPay')} onPress={() => setPaying(true)} /> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title={t('shareWa')} variant="ghost" onPress={() => shareOnWhatsApp(inv, user?.name)} style={{ flex: 1 }} />
              <Button title={t('sharePdf')} variant="ghost" loading={busy} onPress={() => run(() => shareInvoicePdf(inv, user?.name))} style={{ flex: 1 }} />
            </View>
            {!inv.cancelled ? <Button title={t('editInv')} variant="ghost" onPress={() => router.push(`/invoice/form?invoiceId=${inv.id}` as any)} /> : null}
            {!inv.cancelled ? <Button title={t('cancelInv')} variant="danger" onPress={cancel} /> : null}
          </View>
        </>
      )}

      {paying && inv ? (
        <PaymentSheet bookingId={inv.booking_id} defaultAmount={inv.due} tenantName={inv.booking.tenant?.name} onClose={() => setPaying(false)} />
      ) : null}
    </Screen>
  )
}
