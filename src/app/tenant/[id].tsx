import React, { useState } from 'react'
import { Linking, Pressable, View } from 'react-native'
import { Alert } from '../../ui/AppAlert'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import type { BookingFull, Doc, DocKind } from '../../api/types'
import { PaymentDetail } from '../../features/billing/PaymentDetail'
import { PaymentSheet } from '../../features/billing/PaymentSheet'
import { invoiceState } from '../../features/billing/invoiceState'
import { statusLook } from '../../features/bookings/status'
import { MoveOutSheet, NoticeSheet, TransferSheet } from '../../features/bookings/sheets'
import { EditTenantSheet } from '../../features/tenants/EditTenantSheet'
import { useAction } from '../../hooks/useAction'
import { useOpenFile } from '../../hooks/useOpenFile'
import { usePickPhoto } from '../../hooks/usePickPhoto'
import { useSettings } from '../../settings/SettingsProvider'
import { useGetBookingQuery, useSetAgreementMutation } from '../../store/api/bookings'
import { useUploadFileMutation } from '../../store/api/files'
import { useGetInvoicesQuery } from '../../store/api/invoices'
import { useGetPaymentsQuery } from '../../store/api/payments'
import {
  useAddTenantDocumentMutation, useGetTenantQuery, useRemoveTenantDocumentMutation, useUpdateTenantMutation,
} from '../../store/api/tenants'
import { Avatar } from '../../ui/Avatar'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { IconButton } from '../../ui/IconButton'
import { Screen } from '../../ui/Screen'
import { Segmented } from '../../ui/Segmented'
import { Sheet } from '../../ui/Sheet'
import { T } from '../../ui/AppText'
import { showDate } from '../../utils/dates'
import { inr } from '../../utils/format'
import type { PaymentRow } from '../../api/types'
import { Loader } from '../../ui/Loader'
import { NoticeInfo } from '../../features/bookings/NoticeInfo'

function DocRow({ label, doc, onView, onUpload, onRemove }: {
  label: string; doc?: Doc; onView: () => void; onUpload: () => void; onRemove?: () => void
}) {
  const { t, colors } = useSettings()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line }}>
      <View style={{ flex: 1, gap: 3 }}>
        <T w="medium" size={13.5}>{label}</T>
        <Badge label={doc ? t('uploaded') : t('missing')} tone={doc ? 'green' : 'amber'} />
      </View>
      {doc ? <Button title={t('view')} variant="ghost" onPress={onView} style={{ height: 34, paddingHorizontal: 10 }} /> : null}
      <Button title={doc ? t('replace') : t('upload')} variant="ghost" onPress={onUpload} style={{ height: 34, paddingHorizontal: 10 }} />
      {onRemove ? <Button title={t('remove')} variant="danger" onPress={onRemove} style={{ height: 34, paddingHorizontal: 10 }} /> : null}
    </View>
  )
}

type StayAction = 'notice' | 'moveout' | 'transfer'

/** Loads one stay and opens the notice / shifting / move-out sheet for it */
function StayActionHost({ act, onClose }: { act: { kind: StayAction; id: number }; onClose: () => void }) {
  const router = useRouter()
  const q = useGetBookingQuery(act.id)
  const b = q.data
  if (!b) return null
  if (act.kind === 'notice') {
    return <NoticeSheet bookingId={b.id} current={b.status === 'notice' ? { notice_date: b.notice_date, leave_date: b.leave_date } : undefined} onClose={onClose} />
  }
  if (act.kind === 'moveout') return <MoveOutSheet bookingId={b.id} balance={b.summary.balance} onClose={onClose} />
  return <TransferSheet booking={b} onClose={onClose} onDone={(newId) => { onClose(); router.replace(`/booking/${newId}` as any) }} />
}

type PickKind = 'invoice' | 'payment' | 'agreement' | 'details' | StayAction

export default function TenantDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t, colors, errText } = useSettings()
  const router = useRouter()
  const { run } = useAction()
  const pick = usePickPhoto()
  const { open } = useOpenFile()
  const q = useGetTenantQuery(id, { skip: !id })
  const [uploadFile] = useUploadFileMutation()
  const [addDoc] = useAddTenantDocumentMutation()
  const [removeDoc] = useRemoveTenantDocumentMutation()
  const [updateTenant] = useUpdateTenantMutation()
  const [setAgreement] = useSetAgreementMutation()
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState<null | PickKind>(null)
  const [menu, setMenu] = useState(false)
  const [act, setAct] = useState<null | { kind: StayAction; id: number }>(null)
  const [paying, setPaying] = useState<BookingFull | null>(null)
  const [tab, setTab] = useState<'invoices' | 'payments'>('invoices')
  const [openPay, setOpenPay] = useState<PaymentRow | null>(null)
  const tenant = q.data
  const live = tenant?.bookings.filter((b) => b.status !== 'moved_out') ?? []

  // all invoices and payments of this person, across all of his stays (each stay keeps its own money)
  const invs = useGetInvoicesQuery()
  const pays = useGetPaymentsQuery(tenant?.phone ? { search: tenant.phone } : undefined, { skip: !tenant })
  const myInvoices = (invs.data ?? []).filter((i) => i.booking?.tenant?.id === tenant?.id)
  const myPayments = (pays.data?.payments ?? []).filter((p) => p.booking?.tenant?.id === tenant?.id)

  const uploadDoc = async (kind: DocKind) => {
    const p = await pick()
    if (!p || !tenant) return
    await run(async () => {
      const up = await uploadFile({ uri: p.uri, kind, mime: p.mime }).unwrap()
      await addDoc({ tenantId: tenant.id, kind, file_key: up.key, mime_type: up.mime_type }).unwrap()
    })
  }
  const changePhoto = async () => {
    const p = await pick()
    if (!p || !tenant) return
    await run(async () => {
      const up = await uploadFile({ uri: p.uri, kind: 'photo', mime: p.mime }).unwrap()
      await updateTenant({ id: tenant.id, photo_key: up.key }).unwrap()
    })
  }
  const uploadAgreement = async (bookingId: number) => {
    const p = await pick()
    if (!p) return
    await run(async () => {
      const up = await uploadFile({ uri: p.uri, kind: 'agreement', mime: p.mime }).unwrap()
      await setAgreement({ id: bookingId, file_key: up.key }).unwrap()
    })
  }
  const removeOther = (docId: number) =>
    Alert.alert(t('remove'), t('docDeleteQ'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => { run(() => removeDoc(docId).unwrap()) } },
    ])

  // one current stay: act on it directly. Several: ask which one first.
  // which stays an action can be used on
  const listFor = (kind: PickKind): BookingFull[] =>
    kind === 'details' ? tenant?.bookings ?? [] : kind === 'notice' || kind === 'moveout' || kind === 'transfer' ? live.filter((b) => b.status === 'active' || b.status === 'notice') : live
  const doAction = (kind: PickKind, b: BookingFull) => {
    setPending(null)
    if (kind === 'invoice') router.push(`/invoice/form?bookingId=${b.id}` as any)
    else if (kind === 'payment') setPaying(b)
    else if (kind === 'details') router.push(`/booking/${b.id}` as any)
    else if (kind === 'notice' || kind === 'moveout' || kind === 'transfer') setAct({ kind, id: b.id })
    else if (b.agreement_file_key) open(b.agreement_file_key)
    else uploadAgreement(b.id)
  }
  const start = (kind: PickKind) => {
    const list = listFor(kind)
    if (list.length === 1) doAction(kind, list[0])
    else if (list.length > 1) setPending(kind)
  }
  const totalBal = tenant ? tenant.bookings.reduce((s, b) => s + b.balance, 0) : 0
  const canStay = listFor('notice').length > 0
  const agrLabel = live.length === 1 && live[0].agreement_file_key ? t('viewAgr') : t('uploadAgr')

  const docOf = (kind: DocKind) => tenant?.documents.find((d) => d.kind === kind)
  const others = tenant?.documents.filter((d) => d.kind === 'other_id') ?? []
  const roomOf = (b?: { room?: { room_no: string }; bed?: { label: string } | null }) =>
    `${t('room')} ${b?.room?.room_no ?? ''}${b?.bed ? ` · ${t('bed')} ${b.bed.label}` : ''}`

  return (
    <Screen title={tenant?.name ?? t('tenants')} sub={tenant?.phone ? `+91 ${tenant.phone}` : undefined} back refreshing={q.isFetching && !q.isLoading} onRefresh={() => { q.refetch(); invs.refetch(); pays.refetch() }}>
      {q.isLoading ? (
        <Loader />
      ) : q.isError || !tenant ? (
        <Card>
          <T color={colors.red} style={{ marginBottom: 12 }}>{errText(q.error)}</T>
          <Button title={t('retry')} onPress={() => q.refetch()} />
        </Card>
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Pressable onPress={changePhoto}>
                <Avatar name={tenant.name} id={tenant.id} photoKey={tenant.photo_key} size={60} />
              </Pressable>
              <View style={{ flex: 1, gap: 4 }}>
                <T w="bold" size={16}>{tenant.name}</T>
                <T size={12.5} color={colors.muted}>{tenant.phone ? `+91 ${tenant.phone}` : '—'}</T>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  {tenant.phone ? (
                    <IconButton tint={colors.pri} onPress={() => Linking.openURL(`tel:${tenant.phone}`)}>
                      <Feather name="phone" size={18} color={colors.pri} />
                    </IconButton>
                  ) : null}
                  {tenant.phone ? (
                    <IconButton tint="#25D366" onPress={() => Linking.openURL(`https://wa.me/91${tenant.phone}`)}>
                      <MaterialCommunityIcons name="whatsapp" size={22} color="#25D366" />
                    </IconButton>
                  ) : null}
                  <IconButton tint={colors.pri} onPress={() => setEditing(true)}>
                    <Feather name="edit-2" size={17} color={colors.pri} />
                  </IconButton>
                </View>
              </View>
              <View style={{ alignSelf: 'flex-start' }}>
                <IconButton tint={colors.text} onPress={() => setMenu(true)}>
                  <Feather name="more-vertical" size={20} color={colors.text} />
                </IconButton>
              </View>
            </View>
            <View style={{ flexDirection: 'row', marginTop: 12 }}>
              <Badge label={tenant.ekyc_done ? t('ekycOk') : t('ekycPend')} tone={tenant.ekyc_done ? 'green' : 'amber'} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12, backgroundColor: totalBal > 0 ? colors.redbg : totalBal < 0 ? colors.greenbg : colors.line }}>
              <T w="semibold" size={13.5}>{t('tenBal')}</T>
              <T w="bold" size={16} color={totalBal > 0 ? colors.red : totalBal < 0 ? colors.green : colors.muted}>
                {totalBal === 0 ? inr(0) : `${totalBal > 0 ? t('due') : t('adv')} ${inr(Math.abs(totalBal))}`}
              </T>
            </View>

            {live.length > 0 ? (
              <>
                <View style={{ marginTop: 12, gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title={t('addInvoice')} onPress={() => start('invoice')} style={{ flex: 1, height: 42 }} />
                    <Button title={t('recPay')} variant="ghost" onPress={() => start('payment')} style={{ flex: 1, height: 42 }} />
                  </View>
                  <Button title={agrLabel} variant="ghost" onPress={() => start('agreement')} style={{ height: 42 }} />
                </View>

                <T w="bold" size={13.5} style={{ marginTop: 14, marginBottom: 4 }}>{t('currentStay')}</T>
                {live.map((b) => {
                  const look = statusLook(b.status)
                  return (
                    <Pressable
                      key={b.id}
                      onPress={() => router.push(`/booking/${b.id}` as any)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.line }}
                    >
                      <View style={{ flex: 1 }}>
                        <T w="semibold" size={13.5} numberOfLines={1}>{b.property?.name}</T>
                        <T size={12.5}>{roomOf(b)}</T>
                        {b.status === 'notice' ? <NoticeInfo noticeDate={b.notice_date} leaveDate={b.leave_date} /> : null}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 3 }}>
                        <Badge label={t(look.key)} tone={look.tone} />
                        {b.balance !== 0 ? <T w="semibold" size={12} color={b.balance > 0 ? colors.red : colors.green}>{b.balance > 0 ? t('due') : t('adv')} {inr(Math.abs(b.balance))}</T> : null}
                      </View>
                      <Feather name="chevron-right" size={18} color={colors.muted} />
                    </Pressable>
                  )
                })}
              </>
            ) : null}
          </Card>

          <Card>
            <T w="bold" size={14.5} style={{ marginBottom: 6 }}>{t('idProofs')}</T>
            <DocRow label={t('aadFront')} doc={docOf('aadhaar_front')} onView={() => open(docOf('aadhaar_front')!.file_key)} onUpload={() => uploadDoc('aadhaar_front')} />
            <DocRow label={t('aadBack')} doc={docOf('aadhaar_back')} onView={() => open(docOf('aadhaar_back')!.file_key)} onUpload={() => uploadDoc('aadhaar_back')} />
            {others.map((d) => (
              <DocRow key={d.id} label={t('otherId')} doc={d} onView={() => open(d.file_key)} onUpload={() => uploadDoc('other_id')} onRemove={() => removeOther(d.id)} />
            ))}
            <View style={{ height: 8 }} />
            <Button title={t('addOtherId')} variant="ghost" onPress={() => uploadDoc('other_id')} />
          </Card>

          <View style={{ marginBottom: 10 }}>
            <Segmented<'invoices' | 'payments'>
              value={tab}
              onChange={setTab}
              options={[
                { v: 'invoices', label: `${t('invoicesTab')} (${myInvoices.length})` },
                { v: 'payments', label: `${t('paymentsTab')} (${myPayments.length})` },
              ]}
            />
          </View>

          {tab === 'invoices' ? (
            myInvoices.length === 0 ? (
              <T size={13} color={colors.muted} style={{ paddingVertical: 14 }}>{t('noInvTenant')}</T>
            ) : (
              myInvoices.map((i) => {
                const st = invoiceState(i)
                const due = i.cancelled ? 0 : Math.max(0, i.total - i.paid)
                return (
                  <Pressable key={i.id} onPress={() => router.push(`/invoice/${i.id}` as any)}>
                    <Card>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <T w="semibold" size={13.5}>{i.number}</T>
                          <T size={12} color={colors.muted}>{showDate(i.period_start)} → {showDate(i.period_end)}</T>
                          <T size={12} color={colors.muted}>{roomOf(i.booking)}</T>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 3 }}>
                          <Badge label={t(st.key)} tone={st.tone} />
                          <T w="bold" size={15}>{inr(i.total)}</T>
                          {due > 0 ? <T w="semibold" size={12} color={colors.red}>{t('dueL')} {inr(due)}</T> : null}
                        </View>
                      </View>
                    </Card>
                  </Pressable>
                )
              })
            )
          ) : myPayments.length === 0 ? (
            <T size={13} color={colors.muted} style={{ paddingVertical: 14 }}>{t('noPayTenant')}</T>
          ) : (
            myPayments.map((p) => (
              <Pressable key={p.id} onPress={() => setOpenPay(p)}>
                <Card>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <T w="semibold" size={13.5}>{showDate(p.paid_on)}</T>
                      <T size={12} color={colors.muted}>{roomOf(p.booking)}{p.ref_no ? ` · ${p.ref_no}` : ''}</T>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 3 }}>
                      <T w="bold" size={15} color={colors.green}>{inr(p.amount)}</T>
                      <Badge label={p.mode.toUpperCase()} tone="grey" />
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))
          )}
        </>
      )}

      {editing && tenant ? <EditTenantSheet tenant={tenant} onClose={() => setEditing(false)} /> : null}
      {menu && tenant ? (
        <Sheet title={t('moreActions')} onClose={() => setMenu(false)}>
          {[
            { kind: 'details' as PickKind, icon: 'file-text' as const, label: t('bkDetails'), show: tenant.bookings.length > 0 },
            { kind: 'notice' as PickKind, icon: 'calendar' as const, label: t('noticeOrOut'), show: canStay },
            { kind: 'transfer' as PickKind, icon: 'repeat' as const, label: t('shiftingL'), show: canStay },
            { kind: 'moveout' as PickKind, icon: 'log-out' as const, label: t('moveOut'), show: canStay },
          ]
            .filter((x) => x.show)
            .map((x) => (
              <Pressable
                key={x.kind}
                onPress={() => { setMenu(false); start(x.kind) }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.line }}
              >
                <Feather name={x.icon} size={20} color={x.kind === 'moveout' ? colors.red : colors.pri} />
                <T w="semibold" size={15} color={x.kind === 'moveout' ? colors.red : colors.text} style={{ flex: 1 }}>{x.label}</T>
                <Feather name="chevron-right" size={18} color={colors.muted} />
              </Pressable>
            ))}
        </Sheet>
      ) : null}
      {act ? <StayActionHost act={act} onClose={() => setAct(null)} /> : null}
      {pending ? (
        <Sheet title={t('pickStay')} onClose={() => setPending(null)}>
          {listFor(pending).map((b) => (
            <Pressable key={b.id} onPress={() => doAction(pending, b)} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line }}>
              <T w="semibold" size={14}>{b.property?.name}</T>
              <T size={13}>{roomOf(b)}</T>
            </Pressable>
          ))}
        </Sheet>
      ) : null}
      {paying && tenant ? <PaymentSheet bookingId={paying.id} tenantName={tenant.name} defaultAmount={paying.balance} onClose={() => setPaying(null)} /> : null}
      {openPay ? <PaymentDetail p={openPay} onClose={() => setOpenPay(null)} /> : null}
    </Screen>
  )
}
