import React, { useState } from 'react'
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { useSettings } from '../../settings/SettingsProvider'
import { useAuth } from '../../auth/AuthProvider'
import { Button } from '../../ui/Button'
import { Logo } from '../../ui/Logo'
import { HeaderTools } from '../../ui/Screen'
import { T } from '../../ui/AppText'
import { TextField } from '../../ui/TextField'
import { SUPPORT_WHATSAPP } from '../../utils/plans'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// The old phone + OTP login is kept in /later/login-otp.tsx for when SMS login is added.
export default function Login() {
  const { t, colors, errText } = useSettings()
  const { signIn } = useAuth()
  const insets = useSafeAreaInsets()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const emailErr = !EMAIL_RE.test(email.trim()) ? t('errEmail') : ''
  const passErr = password.length === 0 ? t('errPass') : ''

  async function submit() {
    if (emailErr || passErr) { setTried(true); return }
    setBusy(true)
    setError('')
    try {
      await signIn(email.trim(), password)
      // the app moves to the tabs by itself when the login is saved
    } catch (e) {
      setError(errText(e))
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
          <TextField
            label={t('emailL')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="name@example.com"
            error={tried ? emailErr : ''}
          />
          <TextField
            label={t('passL')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            error={tried ? passErr : ''}
            right={
              <Pressable onPress={() => setShow((v) => !v)} hitSlop={10} accessibilityLabel={show ? t('hidePw') : t('showPw')}>
                <Feather name={show ? 'eye-off' : 'eye'} size={20} color={colors.muted} />
              </Pressable>
            }
          />
          {error ? <T size={13} color={colors.red} style={{ marginBottom: 10 }}>{error}</T> : null}
          <Button title={t('loginBtn')} onPress={submit} loading={busy} />
          <Pressable
            onPress={() => SUPPORT_WHATSAPP && Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}`)}
            style={{ alignItems: 'center', padding: 16 }}
          >
            <T w="semibold" size={13.5} color={colors.pri}>{t('forgotPw')}</T>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
