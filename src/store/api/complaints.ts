import { baseApi } from '../baseApi'
import type { ComplaintRow, ComplaintStatus, ComplaintsResult } from '../../api/types'

type FileRef = { file_key: string; mime_type: string }

export const complaintsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // list + counts per status. month = "YYYY-MM" of the date it was created
    getComplaints: builder.query<ComplaintsResult, { status?: ComplaintStatus; month?: string; property_id?: number }>({
      query: (params) => ({ url: '/complaints', params }),
      providesTags: ['Complaints'],
    }),
    getComplaint: builder.query<ComplaintRow, number | string>({
      query: (id) => ({ url: `/complaints/${id}` }),
      providesTags: (_r, _e, id) => [{ type: 'Complaint', id: String(id) }],
    }),
    addComplaint: builder.mutation<
      ComplaintRow,
      {
        kind: 'tenant' | 'property'
        property_id: number
        room_id?: number
        bed_id?: number
        service: string
        description?: string
        files?: FileRef[] // photos of the description
      }
    >({
      query: (body) => ({ url: '/complaints', method: 'POST', body }),
      invalidatesTags: ['Complaints', 'Home'],
    }),
    // add a note (with photos) and/or change the status
    updateComplaint: builder.mutation<ComplaintRow, { id: number; note?: string; files?: FileRef[]; status?: ComplaintStatus }>({
      query: ({ id, ...body }) => ({ url: `/complaints/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, a) => ['Complaints', 'Home', { type: 'Complaint', id: String(a.id) }],
    }),
  }),
})

export const { useGetComplaintsQuery, useGetComplaintQuery, useAddComplaintMutation, useUpdateComplaintMutation } = complaintsApi
