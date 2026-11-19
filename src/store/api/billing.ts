import { baseApi } from '../baseApi'
import type { BalanceRowFull } from '../../api/types'

export const billingApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // one row per booking with its calculated balance. due: 'true' = only bookings that owe money
    getBalances: builder.query<BalanceRowFull[], { due?: 'true'; property_id?: number; status?: string } | void>({
      query: (params) => ({ url: '/balances', params: params ?? undefined }),
      providesTags: ['Balances'],
    }),
  }),
})

export const { useGetBalancesQuery } = billingApi
