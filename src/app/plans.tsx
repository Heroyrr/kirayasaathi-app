import React from 'react'
import { Linking, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useAuth } from '../auth/AuthProvider'
import { useSettings } from '../settings/SettingsProvider'
import { Alert } from '../ui/AppAlert'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Screen } from '../ui/Screen'
import { T } from '../ui/AppText'
import { showDate, toYmd } from '../utils/dates'
import { inr } from '../utils/format'
import { CUSTOM_PLAN, PLANS as FALLBACK_PLANS, SUPPORT_WHATSAPP } from '../utils/plans'
import { useGetPlansQuery } from '../store/api/plans'

function Bar({ used, limit }: { used: number; limit: number | null | undefined }) {
  const { colors } = useSettings()
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden', marginTop: 6 }}>
      <View style={{ width: `${limit ? pct : 8}%`, height: 8, borderRadius: 4, backgroundColor: pct >= 90 ? colors.red : colors.pri }} />
    </View>
  )
}

export default function PlansScreen() {
  const { t, colors, lang } = useSettings()
  const { user, subscription: s } = useAuth()
  const { data: livePlans } = useGetPlansQuery()
  const PLANS = livePlans && livePlans.length ? livePlans : FALLBACK_PLANS

  const stateLook = s?.state === 'view_only' ? { key: 'stView', tone: 'red' as const } : s?.state === 'grace' ? { key: 'stGrace', tone: 'amber' as const } : { key: 'planActive', tone: 'green' as const }
  const planName = s?.plan === 'trial' ? t('planFree') : PLANS.find((p) => p.id === s?.plan)?.name ?? '—'

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

      <T w="bold" size={15} style={{ marginTop: 6, marginBottom: 8 }}>{t('planAvail')}</T>
      {PLANS.map((p) => {
        const current = s?.plan === p.id
        return (
          <View key={p.id} style={{ marginBottom: 12, borderRadius: 18, borderWidth: current ? 2 : 0, borderColor: colors.pri }}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <T w="bold" size={17}>{p.name}</T>
                {current ? <Badge label={t('planCurrent')} tone="green" /> : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                <T w="bold" size={24}>{inr(p.monthly)}</T>
                <T size={13} color={colors.muted}>{t('perMo')}</T>
              </View>
              <T size={12.5} color={colors.muted}>{inr(p.yearly)} {t('perYr')} · {t('yrSave')}</T>
              <View style={{ marginTop: 10, gap: 6 }}>
                {[t('planUpTo', { n: p.units }), p.properties === null ? `${t('planUnl')} ${t('plProps').toLowerCase()}` : p.properties === 1 ? t('planPr1') : t('planPrN', { n: p.properties })].map((x) => (
                  <View key={x} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="check" size={16} color={colors.green} />
                    <T size={13.5}>{x}</T>
                  </View>
                ))}
              </View>
              <T size={12.5} color={colors.muted} style={{ marginTop: 12, marginBottom: 4 }}>{p.why[lang]}</T>
              <View style={{ gap: 6, marginTop: 6 }}>
                {p.features.map((f) => (
                  <View key={f.en} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="check" size={16} color={colors.green} />
                    <T size={13.5} style={{ flex: 1 }}>{f[lang]}</T>
                  </View>
                ))}
              </View>
            </Card>
          </View>
        )
      })}

      <View style={{ marginBottom: 12 }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T w="bold" size={17}>{CUSTOM_PLAN.name}</T>
            <Badge label={lang === 'hi' ? 'आपके लिए' : 'Made for you'} tone="amber" />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
            <T w="bold" size={24}>₹{CUSTOM_PLAN.price}</T>
            <T size={13} color={colors.muted}>{t('perMo')}</T>
          </View>
          <T size={12.5} color={colors.muted} style={{ marginTop: 8 }}>{CUSTOM_PLAN.why[lang]}</T>
          <View style={{ gap: 6, marginTop: 10 }}>
            {CUSTOM_PLAN.features.map((f) => (
              <View key={f.en} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="plus-circle" size={16} color={colors.pri} />
                <T size={13.5} style={{ flex: 1 }}>{f[lang]}</T>
              </View>
            ))}
          </View>
        </Card>
      </View>

      <Button title={t('planContact')} onPress={contact} />
      <T size={12} color={colors.muted} style={{ textAlign: 'center', marginTop: 12 }}>{t('planFoot')}</T>
    </Screen>
  )
}
