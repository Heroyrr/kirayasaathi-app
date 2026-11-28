import React, { useEffect, useRef, useState } from 'react'
import { AppState, Linking, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { api } from '../api/client'
import type { Subscription } from '../api/types'
import { useAuth } from '../auth/AuthProvider'
import { useAction } from '../hooks/useAction'
import { useSettings } from '../settings/SettingsProvider'
import { Alert } from '../ui/AppAlert'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Loader } from '../ui/Loader'
import { Screen } from '../ui/Screen'
import { Segmented } from '../ui/Segmented'
import { T } from '../ui/AppText'
import { showDate, toYmd } from '../utils/dates'
import { inr } from '../utils/format'
import { SUPPORT_WHATSAPP, WEBSITE_URL } from '../utils/plans'
import { useGetPlansQuery, useStartCheckoutMutation, type PlanCycle } from '../store/api/plans'

function Bar({ used, limit }: { used: number; limit: number | null | undefined }) {
  const { colors } = useSettings()
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden', marginTop: 6 }}>
      <View style={{ width: `${limit ? pct : 8}%`, height: 8, borderRadius: 4, backgroundColor: pct >= 90 ? colors.red : colors.pri }} />
    </View>
  )
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function PlansScreen() {
  const { t, colors, lang } = useSettings()
  const { user, subscription: s, refreshMe } = useAuth()
  const { paid } = useLocalSearchParams<{ paid?: string }>()

  // ONLY the plans that are active in the database. No built-in list, no "Custom" card.
  const { data, isLoading, isError, refetch } = useGetPlansQuery()
  const PLANS = (data ?? []).filter((p) => p.monthly > 0)

  const [cycle, setCycle] = useState<PlanCycle>('m')
  const [startCheckout] = useStartCheckoutMutation()
  const { run } = useAction()
  const [payingId, setPayingId] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  // what the plan looked like when the owner left for the payment page (to notice the change when they come back)
  const before = useRef<{ plan: string | null; ends_at?: string } | null>(null)
  const waiting = useRef(false)

  const stateLook = s?.state === 'view_only' ? { key: 'stView', tone: 'red' as const } : s?.state === 'grace' ? { key: 'stGrace', tone: 'amber' as const } : { key: 'planActive', tone: 'green' as const }
  const planName = s?.plan === 'trial' ? t('planFree') : PLANS.find((p) => p.id === s?.plan)?.name ?? (s?.plan ?? '—')

  // The payment is confirmed on the website a moment after the owner pays. Ask the server a few times.
  async function checkAfterPayment(force = false) {
    if (checking) return
    setChecking(true)
    try {
      for (let i = 0; i < 6; i++) {
        const me = await api<{ subscription: Subscription }>('/me')
        const b = before.current
        const changed = force || !b || me.subscription.plan !== b.plan || me.subscription.ends_at !== b.ends_at
        if (changed) {
          await refreshMe()
          refetch()
          before.current = null
          Alert.alert(t('planT'), t('payDone'), undefined, { tone: 'success', icon: 'check-circle' })
          return
        }
        await sleep(3000)
      }
      Alert.alert(t('planT'), t('payWait'), undefined, { tone: 'info', icon: 'clock' })
    } catch {
      /* no internet right now: the owner can open this screen again */
    } finally {
      setChecking(false)
    }
  }

  // the website's "Open the app" button opens ownerapp://plans?paid=1
  useEffect(() => {
    if (paid === '1') checkAfterPayment(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paid])

  // owner comes back from the browser by switching apps
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && waiting.current) {
        waiting.current = false
        checkAfterPayment(false)
      }
    })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pay(planId: string) {
    setPayingId(planId)
    const r = await run(() => startCheckout({ plan: planId, cycle }).unwrap())
    setPayingId(null)
    if (!r.ok) return
    before.current = { plan: s?.plan ?? null, ends_at: s?.ends_at }
    waiting.current = true
    try {
      await Linking.openURL(`${WEBSITE_URL}/pay?t=${r.data.token}`)
    } catch {
      waiting.current = false
      Alert.alert(t('error'), t('planLoadFail'), undefined, { tone: 'error' })
    }
  }

  function contact() {
    if (!SUPPORT_WHATSAPP) {
      Alert.alert(t('planT'), t('planNoNum'), undefined, { tone: 'info', icon: 'message-circle' })
      return
    }
    const text = encodeURIComponent(t('planMsg', { e: user?.email ?? user?.phone ?? '' }))
    Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}?text=${text}`)
  }

  return (
    <Screen title={t('m7')} back>
      <Card>
        <T w="medium" size={12.5} color={colors.muted}>{t('planT')}</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <T w="bold" size={22}>{planName}</T>
          {s ? <Badge label={t(stateLook.key as any)} tone={stateLook.tone} /> : null}
        </View>
        {s?.ends_at ? (
          <T size={13} color={colors.muted} style={{ marginTop: 6 }}>
            {t('planEnds')}: {showDate(toYmd(new Date(s.ends_at)))}
            {typeof s.days_left === 'number' && s.state === 'active' ? ` · ${t('planLeft', { n: s.days_left })}` : ''}
          </T>
        ) : null}

        <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line, gap: 14 }}>
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T w="semibold" size={13.5}>{t('plUnits')}</T>
              <T size={13.5} color={colors.muted}>{s?.used_units ?? 0} / {s?.unit_limit ?? '—'}</T>
            </View>
            <Bar used={s?.used_units ?? 0} limit={s?.unit_limit} />
          </View>
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T w="semibold" size={13.5}>{t('plProps')}</T>
              <T size={13.5} color={colors.muted}>{s?.used_properties ?? 0} / {s?.property_limit ?? t('planUnl')}</T>
            </View>
            <Bar used={s?.used_properties ?? 0} limit={s?.property_limit} />
          </View>
        </View>
      </Card>

      {checking ? <Loader inline label={t('payBack')} /> : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 10 }}>
        <T w="bold" size={15}>{t('planAvail')}</T>
        <Segmented<PlanCycle> value={cycle} onChange={setCycle} options={[{ v: 'm', label: t('payMonthly') }, { v: 'y', label: t('payYearly') }]} />
      </View>

      {isLoading ? (
        <Loader />
      ) : isError ? (
        <View style={{ gap: 12, marginBottom: 12 }}>
          <EmptyState icon="wifi-off" title={t('planLoadFail')} />
          <Button title={t('retry')} onPress={() => refetch()} />
        </View>
      ) : PLANS.length === 0 ? (
        <EmptyState icon="tag-off-outline" title={t('planNone')} />
      ) : (
        PLANS.map((p) => {
          const current = s?.plan === p.id
          const amount = cycle === 'y' ? p.yearly : p.monthly
          const tooSmall = (s?.used_units ?? 0) > p.units || (p.properties !== null && (s?.used_properties ?? 0) > p.properties)
          const features = p.features ?? []
          const why = p.why?.[lang]
          return (
            <View key={p.id} style={{ marginBottom: 12, borderRadius: 18, borderWidth: current ? 2 : 0, borderColor: colors.pri }}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <T w="bold" size={17}>{p.name}</T>
                  {current ? <Badge label={t('planCurrent')} tone="green" /> : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                  <T w="bold" size={24}>{inr(amount)}</T>
                  <T size={13} color={colors.muted}>{cycle === 'y' ? t('perYr') : t('perMo')}</T>
                </View>
                {cycle === 'y' ? <T size={12.5} color={colors.muted}>{t('yrSave')}</T> : <T size={12.5} color={colors.muted}>{inr(p.yearly)} {t('perYr')} · {t('yrSave')}</T>}
                <View style={{ marginTop: 10, gap: 6 }}>
                  {[t('planUpTo', { n: p.units }), p.properties === null ? `${t('planUnl')} ${t('plProps').toLowerCase()}` : p.properties === 1 ? t('planPr1') : t('planPrN', { n: p.properties })].map((x) => (
                    <View key={x} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Feather name="check" size={16} color={colors.green} />
                      <T size={13.5}>{x}</T>
                    </View>
                  ))}
                </View>
                {why ? <T size={12.5} color={colors.muted} style={{ marginTop: 12, marginBottom: 4 }}>{why}</T> : null}
                {features.length ? (
                  <View style={{ gap: 6, marginTop: 6 }}>
                    {features.map((f) => (
                      <View key={f.en} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Feather name="check" size={16} color={colors.green} />
                        <T size={13.5} style={{ flex: 1 }}>{f[lang] || f.en}</T>
                      </View>
                    ))}
                  </View>
                ) : null}

                {tooSmall ? <T size={12.5} color={colors.red} style={{ marginTop: 12 }}>{t('planTooSmall')}</T> : null}
                <Button
                  style={{ marginTop: 14 }}
                  title={current && s?.state === 'active' ? t('payRenew', { a: inr(amount) }) : t('payNow', { a: inr(amount) })}
                  loading={payingId === p.id}
                  disabled={tooSmall || (payingId !== null && payingId !== p.id)}
                  onPress={() => pay(p.id)}
                />
              </Card>
            </View>
          )
        })
      )}

      <Button title={t('planContact')} variant="ghost" onPress={contact} />
      <T size={12} color={colors.muted} style={{ textAlign: 'center', marginTop: 12 }}>{t('planFoot')}</T>
    </Screen>
  )
}
