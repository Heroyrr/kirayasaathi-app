import { Linking } from 'react-native'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import type { PaymentRow } from '../../api/types'
import { showDate } from '../../utils/dates'
import { inr } from '../../utils/format'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const where = (p: PaymentRow) => `${p.booking?.property?.name ?? ''} - Room ${p.booking?.room?.room_no ?? ''}${p.booking?.bed ? ` (Bed ${p.booking.bed.label})` : ''}`

export function receiptText(p: PaymentRow) {
  return [
    'Payment receipt',
    `${p.booking?.tenant?.name ?? ''} | ${where(p)}`,
    `Amount: ${inr(p.amount)}`,
    `Mode: ${p.mode.toUpperCase()}${p.ref_no ? ` | Ref: ${p.ref_no}` : ''}`,
    `Date: ${showDate(p.paid_on)}`,
    'Thank you.',
  ].join('\n')
}

export function receiptOnWhatsApp(p: PaymentRow) {
  const phone = p.booking?.tenant?.phone
  const text = encodeURIComponent(receiptText(p))
  return Linking.openURL(phone ? `https://wa.me/91${phone}?text=${text}` : `https://wa.me/?text=${text}`)
}

export async function shareReceiptPdf(p: PaymentRow) {
  const row = (a: string, b: string) => `<tr><td style="padding:7px 0;color:#5f7075">${esc(a)}</td><td style="padding:7px 0;text-align:right;font-weight:600">${esc(b)}</td></tr>`
  const html = `<html><body style="font-family:Helvetica,Arial,sans-serif;padding:28px;color:#17252a">
    <h2 style="margin:0;color:#1f5c68">Payment receipt</h2>
    <p style="color:#5f7075;margin:4px 0 18px">${esc(showDate(p.paid_on))}</p>
    <p style="margin:0"><b>${esc(p.booking?.tenant?.name ?? '')}</b></p>
    <p style="margin:2px 0 18px;color:#5f7075">${esc(where(p))}</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px">
      ${row('Amount received', inr(p.amount))}${row('Mode', p.mode.toUpperCase())}${p.ref_no ? row('Reference', p.ref_no) : ''}
    </table>
    <p style="margin-top:24px;color:#5f7075">Thank you.</p>
  </body></html>`
  const { uri } = await Print.printToFileAsync({ html })
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' })
}
