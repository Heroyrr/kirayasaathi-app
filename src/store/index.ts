import { configureStore } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'
import { AppState } from 'react-native'
import { useDispatch } from 'react-redux'
import { baseApi } from './baseApi'

export const store = configureStore({
  reducer: { [baseApi.reducerPath]: baseApi.reducer },
  middleware: (getDefault) => getDefault().concat(baseApi.middleware),
})

// refetch when the app comes back to the foreground, so a plan bought on the phone call / admin shows up (properties go live again)
setupListeners(store.dispatch, (dispatch, { onFocus }) => {
  const sub = AppState.addEventListener('change', (st) => { if (st === 'active') dispatch(onFocus()) })
  return () => sub.remove()
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
export const useAppDispatch: () => AppDispatch = useDispatch
