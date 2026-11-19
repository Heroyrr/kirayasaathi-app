import { baseApi } from '../baseApi'
import type { PaymentRow } from '../../api/types'

export const paymentsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // month = 'YYYY-MM'; search matches the reference number or the tenant's mobile
    getPayments: builder.query<{ total: number; payments: PaymentRow[] }, { month?: string; search?: string; property_id?: number } | void>({
      query: (params) => ({ url: '/payments', params: params ?? undefined }),
      providesTags: ['Payments'],
    }),
    // goes to the oldest unpaid invoice first; any extra becomes advance
    addPayment: builder.mutation<
      { payment: PaymentRow; applied: { invoice_id: number; amount: number }[]; to_advance: number; balance: number },
      { booking_id: number; mode: 'cash' | 'upi' | 'bank'; amount: number; ref_no: string; paid_on: string }
    >({
      query: (body) => ({ url: '/payments', method: 'POST', body }),
      invalidatesTags: ['Payments', 'Invoices', 'Invoice', 'Balances', 'Booking', 'Bookings', 'Tenants', 'Tenant', 'Home'],
    }),
  }),
})

export const { useGetPaymentsQuery, useAddPaymentMutation } = paymentsApi
