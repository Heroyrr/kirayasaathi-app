import { baseApi } from '../baseApi'
import type { PlanInfo } from '../../utils/plans'

export type PlanCycle = 'm' | 'y'
export type CheckoutResult = { token: string; amount: number; plan: string; cycle: PlanCycle }

export const plansApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // the plans that are active in the database `plans` table
    getPlans: builder.query<PlanInfo[], void>({
      query: () => ({ url: '/plans' }),
    }),
    // asks the database for a one-time pay link token (the price is taken from the database, never from the app)
    startCheckout: builder.mutation<CheckoutResult, { plan: string; cycle: PlanCycle }>({
      query: (body) => ({ url: '/plans/checkout', method: 'POST', body }),
    }),
  }),
})

export const { useGetPlansQuery, useStartCheckoutMutation } = plansApi
