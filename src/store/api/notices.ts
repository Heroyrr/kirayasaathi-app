import { baseApi } from '../baseApi'
import type { Notice } from '../../api/types'

export const noticesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getNotices: builder.query<Notice[], void>({
      query: () => ({ url: '/notices' }),
      providesTags: ['Notices'],
    }),
  }),
})

export const { useGetNoticesQuery } = noticesApi
