import type { Key } from '../i18n/strings'
import type { ComplaintStatus } from '../api/types'

export const COMPLAINT_STATUSES: ComplaintStatus[] = ['pending', 'processing', 'done', 'cancel']

/** text key and badge colour for each complaint status */
export const complaintStatusLook = (s: ComplaintStatus): { key: Key; tone: 'amber' | 'green' | 'red' | 'grey' } => {
  switch (s) {
    case 'processing': return { key: 'lProc', tone: 'grey' }
    case 'done': return { key: 'lDone', tone: 'green' }
    case 'cancel': return { key: 'lCancelS', tone: 'red' }
    default: return { key: 'lPend', tone: 'amber' }
  }
}
