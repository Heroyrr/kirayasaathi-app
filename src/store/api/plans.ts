import { baseApi } from '../baseApi'
import type { PlanInfo } from '../../utils/plans'

export const plansApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getPlans: builder.query<PlanInfo[], void>({
      query: () => ({ url: '/plans' }),
    }),
  }),
})

export const { useGetPlansQuery } = plansApi
