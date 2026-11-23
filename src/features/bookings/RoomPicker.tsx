import React, { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useSettings } from '../../settings/SettingsProvider'
import { useGetPropertiesQuery, useGetPropertyQuery } from '../../store/api/properties'
import { Chip } from '../../ui/Chip'
import { SelectField } from '../../ui/SelectField'
import { T } from '../../ui/AppText'
import { inr } from '../../utils/format'
import { Loader } from '../../ui/Loader'

export type Slot = {
  propertyId?: number
  roomId?: number
  bedId?: number
  isBed?: boolean
  rent?: number
  roomNo?: string
  bedLabel?: string
  bookingId?: number // set when picking an occupied room or bed
}

/** Pick a property, then a VACANT room (and a vacant bed in a PG). The rent comes from the room's category. */
export function RoomPicker({ value, onChange, want = 'vacant' }: { value: Slot; onChange: (s: Slot) => void; want?: 'vacant' | 'occupied' }) {
  const { t, colors } = useSettings()
  const props = useGetPropertiesQuery()
  const [propertyId, setPropertyId] = useState<number | undefined>(value.propertyId)

  useEffect(() => {
    if (!propertyId && props.data?.length) setPropertyId(props.data[0].id)
  }, [props.data, propertyId])

  const detail = useGetPropertyQuery(propertyId as number, { skip: !propertyId })
  const p = detail.data
  const isBed = p?.type === 'BED'

  const choosePropertyChip = (id: number) => {
    setPropertyId(id)
    onChange({ propertyId: id })
  }

  const selectRoom = (roomId: number, roomNo: string, rent: number, bookingId?: number) => {
    onChange({ propertyId, roomId, roomNo, rent, isBed, bedId: undefined, bedLabel: undefined, bookingId })
  }

  let anyVacant = false
  const selectedRoom = p?.categories.flatMap((c) => c.rooms).find((r) => r.id === value.roomId)

  return (
    <View>
      {props.data && props.data.length > 1 ? (
        <SelectField
          label={t('propSel')}
          value={propertyId}
          options={props.data.map((x) => ({ id: x.id, label: x.name }))}
          onChange={(id) => choosePropertyChip(Number(id))}
        />
      ) : props.data?.[0] ? (
        <T w="semibold" size={14} style={{ marginBottom: 10 }}>{props.data[0].name}</T>
      ) : null}

      {detail.isFetching && !p ? <Loader inline /> : null}

      {p?.categories.map((c) => {
        const rooms = c.rooms
        return (
          <View key={c.id} style={{ marginBottom: 12 }}>
            <T w="semibold" size={13} color={colors.muted} style={{ marginBottom: 6 }}>
              {c.name} · {inr(c.rent)}
            </T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {rooms.map((r) => {
                const total = isBed ? r.beds.length : 1
                const taken = isBed ? r.beds.filter((b) => b.occupied).length : r.occupied ? 1 : 0
                const free = total - taken
                const count = want === 'vacant' ? free : taken // beds shown as vacant/total or taken/total
                const selectable = count > 0
                if (selectable) anyVacant = true
                const on = r.id === value.roomId
                return (
                  <Pressable
                    key={r.id}
                    disabled={!selectable}
                    onPress={() => selectRoom(r.id, r.room_no, c.rent, want === 'occupied' && !isBed ? r.bookings[0]?.booking_id : undefined)}
                    style={{
                      minWidth: 64, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, alignItems: 'center',
                      opacity: selectable ? 1 : 0.4,
                      backgroundColor: on ? colors.btn : selectable ? (want === 'vacant' ? colors.greenbg : colors.amberbg) : colors.line,
                      borderColor: on ? colors.btn : selectable ? (want === 'vacant' ? colors.green : colors.amber) : colors.line,
                    }}
                  >
                    <T w="bold" size={14} color={on ? '#fff' : selectable ? (want === 'vacant' ? colors.green : colors.amber) : colors.muted}>{r.room_no}</T>
                    {isBed ? <T size={10.5} color={on ? '#fff' : colors.muted}>{count}/{total}</T> : null}
                  </Pressable>
                )
              })}
            </View>
          </View>
        )
      })}

      {p && !anyVacant ? <T size={13.5} color={colors.red}>{want === 'vacant' ? t('noVacant') : t('noOccupied')}</T> : null}

      {isBed && selectedRoom ? (
        <View style={{ marginTop: 4 }}>
          <T w="medium" size={12.5} color={colors.muted} style={{ marginBottom: 6 }}>{t('selBed')}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {selectedRoom.beds.map((b) => (
              <View key={b.id} style={{ opacity: (want === 'vacant' ? b.occupied : !b.occupied) ? 0.4 : 1 }}>
                <Chip
                  label={`${t('bed')} ${b.label}`}
                  active={b.id === value.bedId}
                  onPress={(want === 'vacant' ? b.occupied : !b.occupied) ? undefined : () => onChange({ ...value, isBed, bedId: b.id, bedLabel: b.label, bookingId: b.booking?.booking_id })}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  )
}
