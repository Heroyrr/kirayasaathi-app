import { Linking } from 'react-native'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import type { InvoiceFull } from '../../api/types'
import { showDate } from '../../utils/dates'
import { inr } from '../../utils/format'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

const where = (inv: InvoiceFull) =>
  `${inv.booking.property?.name ?? ''} - Room ${inv.booking.room?.room_no ?? ''}${inv.booking.bed ? ` (Bed ${inv.booking.bed.label})` : ''}`

/** File name of the PDF, for example "invoice-december" (the month the rent period starts in) */
export const invoiceFileName = (inv: InvoiceFull) => `invoice-${MONTHS[Math.max(0, Math.min(11, Number(inv.period_start.slice(5, 7)) - 1))]}`

/**
 * The money story of one invoice, in order:
 *   invoice total  -  paid on this invoice  +  previous due (or -  advance)  =  total payable
 * previous_balance is the tenant's balance before this invoice: positive = old due, negative = advance.
 */
function statement(inv: InvoiceFull) {
  const prev = inv.cancelled ? 0 : inv.previous_balance
  const steps: { label: string; amount: number; run: number; tone: 'plus' | 'minus' | 'none' }[] = []
  let run = inv.total
  steps.push({ label: 'Invoice total', amount: inv.total, run, tone: 'none' })
  if (inv.paid > 0 && !inv.cancelled) {
    run -= inv.paid
    steps.push({ label: 'Paid on this invoice', amount: -inv.paid, run, tone: 'minus' })
  }
  if (prev !== 0) {
    run += prev
    steps.push({ label: prev > 0 ? 'Previous due' : 'Advance adjusted', amount: prev, run, tone: prev > 0 ? 'plus' : 'minus' })
  }
  const payable = inv.cancelled ? 0 : run
  return { steps, payable }
}

const money = (n: number) => `${n < 0 ? '- ' : ''}${inr(Math.abs(n))}`
const signed = (n: number) => `${n < 0 ? '- ' : '+ '}${inr(Math.abs(n))}`

/** Plain text for WhatsApp */
export function invoiceText(inv: InvoiceFull, ownerName?: string) {
  const { steps, payable } = statement(inv)
  const lines = [
    `*Invoice ${inv.number}*`,
    `${inv.booking.tenant?.name ?? ''} | ${where(inv)}`,
    `Period: ${showDate(inv.period_start)} to ${showDate(inv.period_end)}`,
    '',
    `Rent: ${inr(inv.rent)}`,
  ]
  if (inv.electricity > 0) lines.push(`Electricity: ${inr(inv.electricity)}`)
  inv.items.forEach((i) => lines.push(`${i.name}: ${inr(i.amount)}`))
  lines.push('')
  steps.forEach((s, idx) => lines.push(idx === 0 ? `${s.label}: ${inr(s.amount)}` : `${s.label}: ${signed(s.amount)}`))
  lines.push('-----------------')
  if (inv.cancelled) lines.push('CANCELLED')
  else lines.push(payable < 0 ? `*Advance balance: ${inr(Math.abs(payable))}*` : `*Total payable: ${inr(payable)}*`)
  if (ownerName) lines.push('', `- ${ownerName}`)
  return lines.join('\n')
}

export function shareOnWhatsApp(inv: InvoiceFull, ownerName?: string) {
  const phone = inv.booking.tenant?.phone
  const text = encodeURIComponent(invoiceText(inv, ownerName))
  return Linking.openURL(phone ? `https://wa.me/91${phone}?text=${text}` : `https://wa.me/?text=${text}`)
}

const LOGO = `<svg width="46" height="46" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" rx="28" fill="#F7F9F9"/><path d="M22 58 L60 26 L98 58" fill="none" stroke="#0F5C68" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M34 50 V94 H86 V50" fill="none" stroke="#0F5C68" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="60" cy="71" r="14" fill="#F4A300"/><text x="60" y="78" text-anchor="middle" font-size="19" font-weight="800" fill="#0B2A30" font-family="Arial,sans-serif">&#8377;</text></svg>`

function buildHtml(inv: InvoiceFull, ownerName?: string) {
  const { steps, payable } = statement(inv)
  const state = inv.cancelled ? { t: 'CANCELLED', bg: '#E5E7EB', fg: '#4B5563' } : inv.due <= 0 ? { t: 'PAID', bg: '#DDF3E4', fg: '#1C7A3C' } : inv.paid > 0 ? { t: 'PARTIAL', bg: '#FFF0CC', fg: '#8A5A00' } : { t: 'UNPAID', bg: '#FDE7E4', fg: '#B42318' }
  const issued = showDate(inv.created_at.slice(0, 10))
  const elec = inv.electricity > 0
    ? `<tr><td class="d">Electricity${inv.start_reading != null && inv.end_reading != null ? `<div class="s">(${inv.end_reading} - ${inv.start_reading} units)${inv.rate ? ` x Rs ${inv.rate}/unit` : ''}${inv.split_count > 1 ? ` / ${inv.split_count} people sharing` : ''}</div>` : ''}</td><td class="a">${esc(inr(inv.electricity))}</td></tr>`
    : ''
  const items = inv.items.map((i) => `<tr><td class="d">${esc(i.name)}</td><td class="a">${esc(inr(i.amount))}</td></tr>`).join('')

  const stRows = steps
    .map((s, idx) => {
      const color = s.tone === 'plus' ? '#B42318' : s.tone === 'minus' ? '#1C7A3C' : '#17252a'
      return `<tr><td class="d">${esc(s.label)}</td><td class="a" style="color:${color}">${esc(idx === 0 ? inr(s.amount) : signed(s.amount))}</td><td class="a">${esc(money(s.run))}</td></tr>`
    })
    .join('')
  const finalLabel = inv.cancelled ? 'CANCELLED' : payable < 0 ? 'ADVANCE BALANCE' : 'TOTAL PAYABLE'
  const finalValue = inv.cancelled ? inr(0) : inr(Math.abs(payable))

  return `<html><head><meta charset="utf-8"><style>
  @page { margin: 0 }
  * { box-sizing: border-box }
  body { margin: 0; font-family: Helvetica, Arial, sans-serif; color: #17252a; font-size: 13px }
  .hd { background: #0F5C68; color: #fff; padding: 22px 30px }
  .hd table { width: 100%; border-collapse: collapse }
  .brand { font-size: 24px; font-weight: 800; letter-spacing: -0.5px }
  .brand b { color: #F4A300 }
  .tag { font-size: 11px; color: #BFE0E6; margin-top: 2px }
  .iv { text-align: right }
  .iv .t { font-size: 26px; font-weight: 800; letter-spacing: 1px }
  .iv .n { font-size: 12px; color: #BFE0E6; margin-top: 2px }
  .gold { height: 5px; background: #F4A300 }
  .body { padding: 26px 30px 10px }
  .two { width: 100%; border-collapse: collapse; margin-bottom: 22px }
  .two td { vertical-align: top; width: 50%; padding-right: 14px }
  .lab { font-size: 10px; letter-spacing: 1.2px; color: #0F7A8A; font-weight: 700; text-transform: uppercase; margin-bottom: 4px }
  .big { font-size: 16px; font-weight: 700 }
  .mut { color: #5f7075; margin-top: 2px }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 99px; font-size: 11px; font-weight: 700; background: ${state.bg}; color: ${state.fg}; margin-top: 8px }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 20px }
  table.items th { background: #E6F1F2; color: #0F5C68; text-align: left; font-size: 11px; letter-spacing: .8px; text-transform: uppercase; padding: 9px 12px }
  table.items th.r { text-align: right }
  table.items td { padding: 10px 12px; border-bottom: 1px solid #E3ECED }
  td.a { text-align: right; white-space: nowrap }
  .s { font-size: 11px; color: #5f7075; margin-top: 2px }
  .final td { background: #0F5C68; color: #fff; font-weight: 800; font-size: 15px; border: 0; padding: 13px 12px }
  .foot { margin: 22px 30px 0; padding-top: 14px; border-top: 1px solid #E3ECED; text-align: center; color: #5f7075; font-size: 11px }
  .thanks { font-size: 15px; font-weight: 700; color: #0F5C68; margin-bottom: 4px }
  .cx { color: #B42318; font-weight: 800; font-size: 20px; letter-spacing: 3px; text-align: center; margin: 6px 0 14px }
  </style></head><body>
  <div class="hd"><table><tr>
    <td style="width:60px">${LOGO}</td>
    <td><div class="brand">Kiraya<b>Saathi</b></div><div class="tag">Rent, tenants and payments, made simple.</div></td>
    <td class="iv"><div class="t">INVOICE</div><div class="n">${esc(inv.number)}</div><div class="n">Issued ${esc(issued)}</div></td>
  </tr></table></div>
  <div class="gold"></div>
  <div class="body">
    <table class="two"><tr>
      <td><div class="lab">Billed to</div><div class="big">${esc(inv.booking.tenant?.name ?? '')}</div>${inv.booking.tenant?.phone ? `<div class="mut">+91 ${esc(inv.booking.tenant.phone)}</div>` : ''}<span class="badge">${state.t}</span></td>
      <td><div class="lab">Property</div><div class="big">${esc(inv.booking.property?.name ?? '')}</div><div class="mut">Room ${esc(inv.booking.room?.room_no ?? '')}${inv.booking.bed ? ` (Bed ${esc(inv.booking.bed.label)})` : ''}</div><div class="mut">${esc(showDate(inv.period_start))} to ${esc(showDate(inv.period_end))}</div>${ownerName ? `<div class="mut">Issued by ${esc(ownerName)}</div>` : ''}</td>
    </tr></table>
    ${inv.cancelled ? '<div class="cx">CANCELLED</div>' : ''}
    <table class="items"><tr><th>Description</th><th class="r">Amount</th></tr>
      <tr><td class="d">Rent</td><td class="a">${esc(inr(inv.rent))}</td></tr>${elec}${items}</table>
    <table class="items"><tr><th>Statement</th><th class="r">Amount</th><th class="r">Total</th></tr>
      ${stRows}
      <tr class="final"><td>${finalLabel}</td><td></td><td class="a">${esc(finalValue)}</td></tr></table>
  </div>
  <div class="foot"><div class="thanks">Thank you!</div>Made with KirayaSaathi</div>
  </body></html>`
}

/** Gives the PDF a clean name, for example invoice-december.pdf. Falls back to the original file if renaming is not possible. */
async function renamePdf(uri: string, name: string): Promise<string> {
  try {
    // @ts-ignore - installed with: npx expo install expo-file-system
    const fs: any = await import('expo-file-system')
    if (fs.File && fs.Paths) {
      const dest = new fs.File(fs.Paths.cache, `${name}.pdf`)
      if (dest.exists) dest.delete()
      new fs.File(uri).move(dest)
      return dest.uri
    }
  } catch {}
  try {
    // @ts-ignore
    const fs: any = await import('expo-file-system/legacy')
    const to = `${fs.cacheDirectory}${name}.pdf`
    await fs.deleteAsync(to, { idempotent: true })
    await fs.moveAsync({ from: uri, to })
    return to
  } catch {}
  return uri
}

/** Builds a one page PDF and opens the phone's share sheet (WhatsApp, mail, save...) */
export async function shareInvoicePdf(inv: InvoiceFull, ownerName?: string) {
  const name = invoiceFileName(inv)
  const { uri } = await Print.printToFileAsync({ html: buildHtml(inv, ownerName), width: 595, height: 842 })
  const file = await renamePdf(uri, name)
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: name })
}
