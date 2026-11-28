import React, { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AntDesign } from '@expo/vector-icons'
import { useSettings } from '../../settings/SettingsProvider'
import { useAuth } from '../../auth/AuthProvider'
import { Logo } from '../../ui/Logo'
import { HeaderTools } from '../../ui/Screen'
import { T } from '../../ui/AppText'

// The only login is Google. A new owner gets a profile and the free plan (30-day trial) automatically.
// The old phone + OTP login is kept in /later/login-otp.tsx for when SMS login is added.
export default function Login() {
  const { t, colors, errText } = useSettings()
  const { signInWithGoogle } = useAuth()
  const insets = useSafeAreaInsets()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function google() {
    setBusy(true)
    setError('')
    try {
      await signInWithGoogle()
      // the app moves to the tabs by itself when the login is saved
    } catch (e) {
      if ((e as { code?: string })?.code !== 'GOOGLE_CANCELLED') setError(errText(e))
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.hd }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 46 }}>
          <View style={{ alignItems: 'flex-end' }}>
            <HeaderTools />
          </View>
          <View style={{ alignItems: 'center', marginTop: 18 }}>
            <Logo size={84} />
            <T w="bold" size={26} color="#fff" style={{ marginTop: 12 }}>{t('appN')}</T>
            <T size={14} color="rgba(255,255,255,0.8)" style={{ textAlign: 'center', marginTop: 2 }}>{t('tag')}</T>
          </View>
        </View>

        <View style={{ flex: 1, marginTop: -22, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.bg, padding: 20, paddingBottom: insets.bottom + 20 }}>
          <T w="bold" size={17} style={{ marginBottom: 14 }}>{t('welcomeL')}</T>
          <Pressable
            onPress={busy ? undefined : google}
            accessibilityRole="button"
            style={({ pressed }) => ({
              height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              opacity: busy ? 0.6 : pressed ? 0.85 : 1,
            })}
          >
            {busy ? <ActivityIndicator color={colors.pri} /> : <AntDesign name="google" size={20} color="#DB4437" />}
            <T w="semibold" size={15}>{t('googleBtn')}</T>
          </Pressable>
          <T size={12.5} color={colors.muted} style={{ textAlign: 'center', marginTop: 10 }}>{t('googleNote')}</T>
          {error ? <T size={13} color={colors.red} style={{ marginTop: 12, textAlign: 'center' }}>{error}</T> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
