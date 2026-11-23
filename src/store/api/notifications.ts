import { baseApi } from '../baseApi'
import type { NotificationsResult } from '../../api/types'

export const notificationsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // the bell list + unread count + the push on/off switch
    getNotifications: builder.query<NotificationsResult, void>({
      query: () => ({ url: '/notifications' }),
      providesTags: ['Notices'],
    }),
    // opening the list marks everything as read
    readNotifications: builder.mutation<{ ok: boolean }, void>({
      query: () => ({ url: '/notifications/read', method: 'POST', body: {} }),
      invalidatesTags: ['Notices'],
    }),
    // More > Notifications switch
    setPushPref: builder.mutation<{ ok: boolean; push_enabled: boolean }, boolean>({
      query: (enabled) => ({ url: '/push-pref', method: 'PUT', body: { enabled } }),
      invalidatesTags: ['Notices'],
    }),
  }),
})

export const { useGetNotificationsQuery, useReadNotificationsMutation, useSetPushPrefMutation } = notificationsApi
