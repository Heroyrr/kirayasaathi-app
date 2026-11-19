import type { Key } from '../i18n/strings'
import type { LeadStatus } from '../api/types'

export const LEAD_STATUSES: LeadStatus[] = ['pending', 'processing', 'done', 'cancel']

/** text key and badge colour for each lead status */
export const leadStatusLook = (s: LeadStatus): { key: Key; tone: 'amber' | 'green' | 'red' | 'grey' } => {
  switch (s) {
    case 'processing': return { key: 'lProc', tone: 'amber' }
    case 'done': return { key: 'lDone', tone: 'green' }
    case 'cancel': return { key: 'lCancelS', tone: 'red' }
    default: return { key: 'lPend', tone: 'grey' }
  }
}
