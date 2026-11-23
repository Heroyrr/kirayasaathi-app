import React from 'react'
import { View } from 'react-native'
import { useSettings } from '../../settings/SettingsProvider'
import { Badge } from '../../ui/Badge'
import { T } from '../../ui/AppText'
import { daysFromToday, showDate } from '../../utils/dates'

/** Notice status of a tenant: when notice was given, the leaving date and how many days are left */
export function NoticeInfo({ noticeDate, leaveDate }: { noticeDate?: string | null; leaveDate?: string | null }) {
  const { t, colors } = useSettings()
  if (!noticeDate && !leaveDate) return null
  const left = leaveDate ? daysFromToday(leaveDate) : null
  const tone = left === null ? 'grey' : left <= 0 ? 'red' : left <= 7 ? 'amber' : 'grey'
  const label =
    left === null ? ''
    : left < 0 ? t('leavePassed', { n: Math.abs(left) })
    : left === 0 ? t('leaveToday')
    : left === 1 ? t('leaveTomorrow')
    : t('leaveInDays', { n: left })
  return (
    <View style={{ marginTop: 8, gap: 4 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {noticeDate ? <T size={12.5} color={colors.muted}>{t('noticeGiven')}: <T w="semibold" size={12.5}>{showDate(noticeDate)}</T></T> : null}
        {leaveDate ? <T size={12.5} color={colors.muted}>{t('leaveOn2')}: <T w="semibold" size={12.5}>{showDate(leaveDate)}</T></T> : null}
      </View>
      {label ? <Badge label={label} tone={tone} /> : null}
    </View>
  )
}
