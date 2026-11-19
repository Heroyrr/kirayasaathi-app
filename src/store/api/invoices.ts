import { baseApi } from '../baseApi'
import type { InvoiceFull, InvoicePreview, InvoiceRow } from '../../api/types'

/** Invoices change balances, Home dues, the tenant list badges and the booking ledger */
const AFTER_INVOICE = ['Invoices', 'Invoice', 'Balances', 'Booking', 'Bookings', 'Tenants', 'Tenant', 'Home', 'Meters', 'Readings'] as const

type Extra = { name: string; amount: number }
type InvoiceBody = {
  period_start?: string
  period_end?: string
  rent?: number
  rate?: number
  start_reading?: number
  end_reading?: number
  meter_reset?: boolean
  split_count?: number
  extras?: Extra[]
  apply_advance?: boolean // new tenant: take the advance off this invoice
}

export const invoicesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // due: 'true' = unpaid or partly paid only; month = 'YYYY-MM'
    getInvoices: builder.query<
      InvoiceRow[],
      { property_id?: number; booking_id?: number; month?: string; due?: 'true'; cancelled?: 'true' | 'false' } | void
    >({
      query: (params) => ({ url: '/invoices', params: params ?? undefined }),
      providesTags: ['Invoices'],
    }),
    getInvoice: builder.query<InvoiceFull, number | string>({
      query: (invoiceId) => ({ url: `/invoices/${invoiceId}` }),
      providesTags: (_r, _e, invoiceId) => [{ type: 'Invoice', id: String(invoiceId) }],
    }),
    // defaults for the invoice form: rent, last two meter readings, last rate, people sharing
    getInvoicePreview: builder.query<InvoicePreview, number | string>({
      query: (bookingId) => ({ url: `/bookings/${bookingId}/invoice-preview` }),
      providesTags: ['Meters', 'Invoices'],
    }),
    addInvoice: builder.mutation<InvoiceFull, { bookingId: number } & Required<Pick<InvoiceBody, 'period_start' | 'period_end'>> & InvoiceBody>({
      query: ({ bookingId, ...body }) => ({ url: `/bookings/${bookingId}/invoices`, method: 'POST', body }),
      invalidatesTags: [...AFTER_INVOICE],
    }),
    updateInvoice: builder.mutation<InvoiceFull, { id: number } & InvoiceBody>({
      query: ({ id, ...body }) => ({ url: `/invoices/${id}`, method: 'PATCH', body }),
      invalidatesTags: [...AFTER_INVOICE],
    }),
    // flags it cancelled, removes it from the balance, moves its payments to advance
    cancelInvoice: builder.mutation<InvoiceFull, number>({
      query: (id) => ({ url: `/invoices/${id}/cancel`, method: 'POST' }),
      invalidatesTags: [...AFTER_INVOICE, 'Payments'],
    }),
  }),
})

export const {
  useGetInvoicesQuery,
  useGetInvoiceQuery,
  useGetInvoicePreviewQuery,
  useAddInvoiceMutation,
  useUpdateInvoiceMutation,
  useCancelInvoiceMutation,
} = invoicesApi
