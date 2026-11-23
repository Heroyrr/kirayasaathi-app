import React, { useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import type { InvoiceRow } from '../../api/types'
import { invoiceState } from '../../features/billing/invoiceState'
import { useSettings } from '../../settings/SettingsProvider'
import { useGetBookingsQuery } from '../../store/api/bookings'
import { useGetInvoicesQuery } from '../../store/api/invoices'
import { useGetTenantsQuery } from '../../store/api/tenants'
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

type InvFilter = 'all' | 'unpaid' | 'partial' | 'paid' | 'missing'

/** Which month an invoice belongs to: the month its rent period STARTS (12 Nov to 12 Dec = Nov) */
const monthOf = (i: InvoiceRow) => i.period_start.slice(0, 7)
const dueOf = (i: InvoiceRow) => (i.cancelled ? 0 : Math.max(0, i.total - i.paid))

export default function InvoicesScreen() {
  const { t, colors, errText } = useSettings()
  const router = useRouter()
  const [invFilter, setInvFilter] = useState<InvFilter>('all')
  const [month, setMonth] = useState(currentMonth())
  const [search, setSearch] = useState('')
  const isMax = month >= shiftMonth(currentMonth(), 2) // you can look up to 2 months ahead (to bill December in November)

  const inv = useGetInvoicesQuery()
  const live = useGetBookingsQuery({ status: 'live' })
  const tenants = useGetTenantsQuery()

  const phoneById = useMemo(() => {
    const m: Record<number, string> = {}
    for (const x of tenants.data ?? []) if (x.phone) m[x.id] = x.phone
    return m
  }, [tenants.data])

  const needle = search.trim().toLowerCase().replace(/^\+?91/, '')
  const scoped = (inv.data ?? []).filter((i) => {
    if (monthOf(i) !== month) return false
    if (!needle) return true
    const phone = phoneById[i.booking?.tenant?.id ?? -1] ?? ''
    const hay = `${i.number} ${i.booking?.tenant?.name ?? ''} ${phone} ${i.booking?.room?.room_no ?? ''} ${i.booking?.property?.name ?? ''}`.toLowerCase()
    return hay.includes(needle)
  })
  const invoices = scoped.filter((i) => invFilter === 'all' || (invFilter !== 'missing' && invoiceState(i).code === invFilter))

  // tenants who are staying in this month but have no invoice for it yet (reservations are not billed yet)
  const missing = useMemo(() => {
    const billed = new Set<number>()
    for (const i of inv.data ?? []) if (!i.cancelled && monthOf(i) === month) billed.add(i.booking_id)
    return (live.data ?? []).filter((b) => {
      if (b.status === 'reserved' || billed.has(b.id)) return false
      if ((b.start_date ?? '').slice(0, 7) > month) return false
      if (!needle) return true
      const hay = `${b.tenant?.name ?? ''} ${b.tenant?.phone ?? ''} ${b.room?.room_no ?? ''} ${b.property?.name ?? ''}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [inv.data, live.data, month, needle])

  const sums = useMemo(() => {
    let billed = 0
    let paid = 0
    let due = 0
    for (const i of scoped) {
      if (i.cancelled) continue
      billed += i.total
      paid += Math.min(i.paid, i.total)
      due += dueOf(i)
    }
    return { billed, paid, due }
  }, [scoped])

  const showInvoices = invFilter !== 'missing'
  const showMissing = invFilter === 'all' || invFilter === 'missing'
  const refresh = () => { inv.refetch(); live.refetch(); tenants.refetch() }
  const loading = inv.isLoading || live.isLoading
  const error = inv.error ?? live.error

  return (
    <Screen
      title={t('inv')}
      refreshing={(inv.isFetching || live.isFetching) && !loading}
      onRefresh={refresh}
      fab={<Fab onPress={() => router.push('/invoice/form' as any)} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Pressable onPress={() => setMonth(shiftMonth(month, -1))} hitSlop={10} style={{ padding: 8 }}>
          <Feather name="chevron-left" size={22} color={colors.pri} />
        </Pressable>
        <T w="bold" size={16}>{monthLabel(month)}</T>
        <Pressable onPress={() => !isMax && setMonth(shiftMonth(month, 1))} hitSlop={10} style={{ padding: 8, opacity: isMax ? 0.3 : 1 }}>
          <Feather name="chevron-right" size={22} color={colors.pri} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <StatTile compact tone="grey" label={t('billed')} value={inr(sums.billed)} />
        <StatTile compact tone="green" label={t('collectedL')} value={inr(sums.paid)} />
        <StatTile compact tone="red" label={t('pendingL')} value={inr(sums.due)} />
      </View>

      <TextField value={search} onChangeText={setSearch} placeholder={t('searchInv')} autoCapitalize="none" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <Chip label={t('fAll')} active={invFilter === 'all'} onPress={() => setInvFilter('all')} />
        <Chip label={t('fUnpaid')} active={invFilter === 'unpaid'} onPress={() => setInvFilter('unpaid')} />
        <Chip label={t('fPartial')} active={invFilter === 'partial'} onPress={() => setInvFilter('partial')} />
        <Chip label={t('fPaid')} active={invFilter === 'paid'} onPress={() => setInvFilter('paid')} />
        <Chip label={`${t('fNotCreated')} (${missing.length})`} active={invFilter === 'missing'} onPress={() => setInvFilter('missing')} />
      </View>

      {loading ? (
        <Loader />
      ) : error ? (
        <Card>
          <T color={colors.red} style={{ marginBottom: 12 }}>{errText(error)}</T>
          <Button title={t('retry')} onPress={refresh} />
        </Card>
      ) : (
        <>
          {showInvoices ? (
            invoices.length === 0 && !(showMissing && missing.length > 0) ? (
              <EmptyState icon="receipt-text-outline" title={t('noInvs')} sub={t('noInvsH')} />
            ) : (
              invoices.map((i) => {
                const st = invoiceState(i)
                const due = dueOf(i)
                const phone = phoneById[i.booking?.tenant?.id ?? -1]
                return (
                  <Pressable key={i.id} onPress={() => router.push(`/invoice/${i.id}` as any)}>
                    <Card>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <T w="bold" size={14.5} numberOfLines={1}>{i.booking?.tenant?.name}</T>
                          {phone ? <T size={12} color={colors.muted}>+91 {phone}</T> : null}
                        </View>
                        <Badge label={t(st.key)} tone={st.tone} />
                      </View>
                      <T size={12.5} color={colors.muted} style={{ marginTop: 4 }} numberOfLines={1}>
                        {i.booking?.property?.name} · {t('room')} {i.booking?.room?.room_no}
                      </T>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
                        <View>
                          <T size={11.5} color={colors.muted}>{i.number}</T>
                          <T size={11.5} color={colors.muted}>{showDate(i.period_start)} → {showDate(i.period_end)}</T>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <T w="bold" size={16}>{inr(i.total)}</T>
                          {due > 0 ? <T w="semibold" size={12} color={colors.red}>{t('dueL')} {inr(due)}</T> : null}
                        </View>
                      </View>
                    </Card>
                  </Pressable>
                )
              })
            )
          ) : null}

          {showMissing && missing.length > 0 ? (
            <>
              <T w="bold" size={14} color={colors.muted} style={{ marginTop: 6, marginBottom: 8 }}>{t('notCreatedT')} ({missing.length})</T>
              {missing.map((b) => (
                <Pressable key={b.id} onPress={() => router.push(`/invoice/form?bookingId=${b.id}&month=${month}` as any)}>
                  <Card>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <T w="bold" size={14.5} numberOfLines={1}>{b.tenant?.name}</T>
                        {b.tenant?.phone ? <T size={12} color={colors.muted}>+91 {b.tenant.phone}</T> : null}
                        <T size={12.5} color={colors.muted} numberOfLines={1}>
                          {b.property?.name} · {t('room')} {b.room?.room_no}{b.bed ? ` (${t('bed')} ${b.bed.label})` : ''}
                        </T>
                      </View>
                      <Badge label={t('createInv')} tone="amber" />
                    </View>
                  </Card>
                </Pressable>
              ))}
            </>
          ) : null}

          {invFilter === 'missing' && missing.length === 0 ? (
            <EmptyState icon="check-circle-outline" title={t('noInvs')} />
          ) : null}
        </>
      )}
    </Screen>
  )
}
