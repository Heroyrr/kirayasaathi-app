import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { Redirect, useLocalSearchParams } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useSettings } from '../../settings/SettingsProvider'
import { useAuth } from '../../auth/AuthProvider'

/*
| Google sends the owner back here (ownerapp://auth/callback?code=...).
| Normally the login screen finishes the login by itself. If the phone opens the app through this link instead,
| this screen finishes it with the code. The code works only once, so both ways share one result (see finishGoogle).
*/
export default function AuthCallback() {
  const { colors } = useSettings()
  const { status, finishGoogleCode } = useAuth()
  const { code } = useLocalSearchParams<{ code?: string }>()

  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession() // closes the popup on the web
    if (code && status !== 'in') finishGoogleCode(String(code)).catch(() => {})
  }, [code])

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator color={colors.pri} />
      {status === 'in' ? <Redirect href={'/' as any} /> : null}
    </View>
  )
}
