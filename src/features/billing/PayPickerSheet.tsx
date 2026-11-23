import React, { useState } from 'react'
import { View } from 'react-native'
import { RoomPicker, type Slot } from '../bookings/RoomPicker'
import { statusLook } from '../bookings/status'
import { useSettings } from '../../settings/SettingsProvider'
import { useGetBookingQuery } from '../../store/api/bookings'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { KeyValue } from '../../ui/KeyValue'
import { Sheet } from '../../ui/Sheet'
import { T } from '../../ui/AppText'
import { inr } from '../../utils/format'
import { Loader } from '../../ui/Loader'

/** Choose the property, then the room (and bed in a PG). The tenant's details appear; tap to take the payment. */
export function PayPickerSheet({ onClose, onPay }: { onClose: () => void; onPay: (b: { id: number; name: string; balance: number }) => void }) {
  const { t, colors } = useSettings()
  const [slot, setSlot] = useState<Slot>({})
  const bq = useGetBookingQuery(slot.bookingId as number, { skip: !slot.bookingId })
  const b = bq.data
  const look = b ? statusLook(b.status) : null

  return (
    <Sheet title={t('addPay')} onClose={onClose}>
      <T w="medium" size={12.5} color={colors.muted} style={{ marginBottom: 6 }}>{t('selectRoomPay')}</T>
      <RoomPicker want="occupied" value={slot} onChange={setSlot} />

      {slot.bookingId && bq.isLoading ? <Loader inline /> : null}
      {b && look ? (
        <Card style={{ marginTop: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <T w="bold" size={15}>{t('tenantDetails')}</T>
            <Badge label={t(look.key)} tone={look.tone} />
          </View>
          <KeyValue label={t('tenantL')} value={b.tenant?.name ?? '—'} />
          <KeyValue label={t('mobileL')} value={b.tenant?.phone ? `+91 ${b.tenant.phone}` : '—'} />
          <KeyValue label={t('selProp')} value={b.property?.name ?? '—'} />
          <KeyValue label={t('roomNoL')} value={`${b.room?.room_no ?? ''}${b.bed ? ` · ${t('bed')} ${b.bed.label}` : ''}`} />
          <KeyValue
            label={b.balance > 0 ? t('balDue') : b.balance < 0 ? t('balAdv') : t('balance')}
            value={inr(Math.abs(b.balance))}
            color={b.balance > 0 ? colors.red : b.balance < 0 ? colors.green : colors.muted}
            bold
          />
          <View style={{ height: 8 }} />
          <Button title={t('payToTenant')} onPress={() => onPay({ id: b.id, name: b.tenant?.name ?? '', balance: b.balance })} />
        </Card>
      ) : null}
    </Sheet>
  )
}
