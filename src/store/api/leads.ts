import { baseApi } from '../baseApi'
import type { Lead, LeadStatus, LeadsResult } from '../../api/types'

type LeadBody = {
  name?: string
  phone?: string
  property_id?: number | null
  property_ids?: number[] // all properties of the lead (replaces the old list)
  note?: string
  status?: LeadStatus
  last_talk?: string
  next_action?: string
  next_action_at?: string // "YYYY-MM-DD", empty string clears it
}

export const leadsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // list + counts per status. search = name or mobile, date = "YYYY-MM-DD" of the next action
    getLeads: builder.query<LeadsResult, { status?: LeadStatus; search?: string; date?: string } | void>({
      query: (params) => ({ url: '/leads', params: params ?? undefined }),
      providesTags: ['Leads'],
    }),
    getLead: builder.query<Lead, number | string>({
      query: (id) => ({ url: `/leads/${id}` }),
      providesTags: (_r, _e, id) => [{ type: 'Lead', id: String(id) }],
    }),
    addLead: builder.mutation<{ id: number }, Required<Pick<LeadBody, 'name' | 'phone'>> & Pick<LeadBody, 'property_ids' | 'note'>>({
      query: (body) => ({ url: '/leads', method: 'POST', body }),
      invalidatesTags: ['Leads', 'Home'],
    }),
    updateLead: builder.mutation<Lead, { id: number } & LeadBody>({
      query: ({ id, ...body }) => ({ url: `/leads/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, a) => ['Leads', 'Home', { type: 'Lead', id: String(a.id) }],
    }),
    deleteLead: builder.mutation<{ deleted: boolean }, number>({
      query: (id) => ({ url: `/leads/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Leads', 'Home'],
    }),
  }),
})

export const { useGetLeadsQuery, useGetLeadQuery, useAddLeadMutation, useUpdateLeadMutation, useDeleteLeadMutation } = leadsApi
