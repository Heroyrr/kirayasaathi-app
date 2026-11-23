import React, { useEffect, useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { PaymentRow } from '../../api/types'
import { PayPickerSheet } from '../../features/billing/PayPickerSheet'
import { PaymentDetail } from '../../features/billing/PaymentDetail'
import { PaymentSheet } from '../../features/billing/PaymentSheet'
import { useSettings } from '../../settings/SettingsProvider'
import { useGetPaymentsQuery } from '../../store/api/payments'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Chip } from '../../ui/Chip'
import { EmptyState } from '../../ui/EmptyState'
import { Fab } from '../../ui/Fab'
import { Screen } from '../../ui/Screen'
import { StatTile } from '../../ui/StatTile'
import { T } from '../../ui/AppText'
import { TextField } from '../../ui/TextField'
import { currentMonth, monthLabel, shiftMonth, showDate } from '../../utils/dates'
import { inr } from '../../utils/format'
import { Loader } from '../../ui/Loader'

type Mode = 'all' | 'cash' | 'upi' | 'bank'

export default function Payments() {
  const { t, colors, errText } = useSettings()
  const [month, setMonth] = useState(currentMonth())
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [mode, setMode] = useState<Mode>('all')
  const [picking, setPicking] = useState(false)
  const [paying, setPaying] = useState<{ id: number; name: string; balance: number } | null>(null)
  const [open, setOpen] = useState<PaymentRow | null>(null)

  useEffect(() => {
    const h = setTimeout(() => setDebounced(search.trim()), 350)
    return () => clearTimeout(h)
  }, [search])

  const q = useGetPaymentsQuery({ month, search: debounced || undefined })
  const isNow = month >= currentMonth()

  // totals by mode for the month (and search) shown; the chips then narrow the list
  const sums = useMemo(() => {
    const s = { cash: 0, upi: 0, bank: 0 }
    for (const p of q.data?.payments ?? []) s[p.mode] += p.amount
    return s
  }, [q.data])
  const list = (q.data?.payments ?? []).filter((p) => mode === 'all' || p.mode === mode)
  const shownTotal = list.reduce((s, p) => s + p.amount, 0)

  return (
    <Screen title={t('paymentsT')} back refreshing={q.isFetching && !q.isLoading} onRefresh={() => q.refetch()} fab={<Fab onPress={() => setPicking(true)} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Pressable onPress={() => setMonth(shiftMonth(month, -1))} hitSlop={10} style={{ padding: 8 }}>
          <Feather name="chevron-left" size={22} color={colors.pri} />
        </Pressable>
        <T w="bold" size={16}>{monthLabel(month)}</T>
        <Pressable onPress={() => !isNow && setMonth(shiftMonth(month, 1))} hitSlop={10} style={{ padding: 8, opacity: isNow ? 0.3 : 1 }}>
          <Feather name="chevron-right" size={22} color={colors.pri} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <StatTile compact tone="green" label={t('mCash')} value={inr(sums.cash)} />
        <StatTile compact tone="green" label={t('mUpi')} value={inr(sums.upi)} />
        <StatTile compact tone="green" label={t('mBank')} value={inr(sums.bank)} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <T size={13} color={colors.muted}>{t('paymentsCount', { n: list.length })}</T>
        <T w="bold" size={15}>{t('totalL')}: {inr(shownTotal)}</T>
      </View>

      <TextField value={search} onChangeText={setSearch} placeholder={t('searchPay')} autoCapitalize="none" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <Chip label={t('fAll')} active={mode === 'all'} onPress={() => setMode('all')} />
        <Chip label={t('mCash')} active={mode === 'cash'} onPress={() => setMode('cash')} />
        <Chip label={t('mUpi')} active={mode === 'upi'} onPress={() => setMode('upi')} />
        <Chip label={t('mBank')} active={mode === 'bank'} onPress={() => setMode('bank')} />
      </View>

      {q.isLoading ? (
        <Loader />
      ) : q.isError ? (
        <Card>
          <T color={colors.red} style={{ marginBottom: 12 }}>{errText(q.error)}</T>
          <Button title={t('retry')} onPress={() => q.refetch()} />
        </Card>
      ) : list.length === 0 ? (
        <EmptyState icon="cash-multiple" title={t('noPays')} />
      ) : (
        list.map((p) => (
          <Pressable key={p.id} onPress={() => setOpen(p)}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <T w="bold" size={14.5} numberOfLines={1}>{p.booking?.tenant?.name}</T>
                  <T size={12.5} color={colors.muted} numberOfLines={1}>{p.booking?.property?.name} · {t('room')} {p.booking?.room?.room_no}</T>
                  <T size={12} color={colors.muted}>{showDate(p.paid_on)}{p.ref_no ? ` · ${p.ref_no}` : ''}</T>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <T w="bold" size={16} color={colors.green}>{inr(p.amount)}</T>
                  <Badge label={p.mode.toUpperCase()} tone="grey" />
                </View>
              </View>
            </Card>
          </Pressable>
        ))
      )}

      {picking ? (
        <PayPickerSheet onClose={() => setPicking(false)} onPay={(b) => { setPicking(false); setPaying(b) }} />
      ) : null}
      {paying ? <PaymentSheet bookingId={paying.id} tenantName={paying.name} defaultAmount={paying.balance} onClose={() => setPaying(null)} /> : null}
      {open ? <PaymentDetail p={open} onClose={() => setOpen(null)} /> : null}
    </Screen>
  )
}
