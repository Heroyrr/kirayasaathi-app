import type { InvoiceRow } from '../../api/types'
import type { Key } from '../../i18n/strings'
import type { Tone } from '../../ui/Badge'

/** paid / partial / unpaid / cancelled for one invoice */
export function invoiceState(i: Pick<InvoiceRow, 'total' | 'paid' | 'cancelled'>): { key: Key; tone: Tone; code: 'cancelled' | 'paid' | 'partial' | 'unpaid' } {
  if (i.cancelled) return { key: 'cancelledL', tone: 'grey', code: 'cancelled' }
  if (i.paid >= i.total) return { key: 'stPaid', tone: 'green', code: 'paid' }
  if (i.paid > 0) return { key: 'stPartial', tone: 'amber', code: 'partial' }
  return { key: 'stUnpaid', tone: 'red', code: 'unpaid' }
}
