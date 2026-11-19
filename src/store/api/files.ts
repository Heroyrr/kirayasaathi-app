import { baseApi } from '../baseApi'

export const filesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // upload a photo picked on the phone to the private Supabase bucket, returns the key to save with the record
    uploadFile: builder.mutation<{ key: string; mime_type: string; size: number }, { uri: string; kind: string; mime?: string }>({
      query: ({ uri, kind, mime = 'image/jpeg' }) => ({ url: '/files', method: 'POST', body: { uri, kind, mime } }),
    }),
    // short-lived link (10 minutes) to show or open a private file
    getFileLink: builder.query<{ url: string; expires_in: number }, string>({
      query: (key) => ({ url: '/files/url', params: { key } }),
      keepUnusedDataFor: 300,
      providesTags: (_r, _e, key) => [{ type: 'File', id: key }],
    }),
  }),
})

export const { useUploadFileMutation, useGetFileLinkQuery, useLazyGetFileLinkQuery } = filesApi
