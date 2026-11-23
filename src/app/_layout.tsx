import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { useFonts } from 'expo-font'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Provider } from 'react-redux'
import { store, useAppDispatch } from '../store'
import { baseApi } from '../store/baseApi'
import { SettingsProvider, useSettings } from '../settings/SettingsProvider'
import { AuthProvider, useAuth } from '../auth/AuthProvider'
import { fontAssets } from '../theme/fonts'
import { AppAlertHost } from '../ui/AppAlert'
import { UpdateProvider, useUpdate } from '../features/updates/UpdateProvider'
import { ForceUpdateScreen } from '../features/updates/ForceUpdateScreen'
import { PushSetup } from '../features/notifications/PushSetup'

SplashScreen.preventAutoHideAsync()

/** Waits for fonts, saved settings and the saved login, then sends the user to login or the app */
function Gate() {
  const { status } = useAuth()
  const { ready } = useSettings()
  const [fontsLoaded] = useFonts(fontAssets)
  const segments = useSegments()
  const router = useRouter()
  const dispatch = useAppDispatch()
  const update = useUpdate()
  const appReady = fontsLoaded && ready && status !== 'loading'

  useEffect(() => {
    if (appReady) SplashScreen.hideAsync()
  }, [appReady])

  useEffect(() => {
    if (!appReady) return
    const inAuth = segments[0] === '(auth)'
    if (status === 'out') {
      dispatch(baseApi.util.resetApiState()) // forget the previous owner's data
      if (!inAuth) router.replace('/(auth)/login' as any)
    } else if (status === 'in' && inAuth) {
      router.replace('/(tabs)' as any)
    }
  }, [appReady, status, segments])

  if (!appReady) return null
  // installed version is older than min_version in app_config: block the app until the owner updates
  if (status === 'in' && update.state === 'forced') {
    return (
      <>
        <StatusBar style="dark" />
        <ForceUpdateScreen />
      </>
    )
  }
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
      {status === 'in' ? <PushSetup /> : null}
    </>
  )
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <SettingsProvider>
          <AuthProvider>
            <UpdateProvider>
              <Gate />
              <AppAlertHost />
            </UpdateProvider>
          </AuthProvider>
        </SettingsProvider>
      </Provider>
    </SafeAreaProvider>
  )
}
