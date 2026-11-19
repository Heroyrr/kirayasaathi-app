/*
| Nice popups for the whole app. Use it exactly like the phone's Alert:
|     Alert.alert('Title', 'Message', [{ text: 'Delete', style: 'destructive', onPress }, { text: 'Cancel', style: 'cancel' }], { tone: 'danger' })
| tone: success | error | warning | info | danger  (danger is picked by itself for a destructive button)
| icon: any Feather icon name (optional)
| <AppAlertHost /> is mounted once in app/_layout.tsx.
*/
import React, { useEffect, useRef, useState } from 'react'
import { Alert as RNAlert, Animated, Modal, Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useSettings } from '../settings/SettingsProvider'
import { T } from './AppText'

type Tone = 'success' | 'error' | 'warning' | 'info' | 'danger'
type Icon = React.ComponentProps<typeof Feather>['name']
export type DialogButton = { text?: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void }
type Options = { tone?: Tone; icon?: Icon }
type Data = { title: string; message?: string; buttons: DialogButton[]; tone: Tone; icon?: Icon }

let host: ((d: Data) => void) | null = null

export const Alert = {
  alert(title: string, message?: string, buttons?: DialogButton[], options?: Options) {
    const list: DialogButton[] = buttons && buttons.length ? buttons : [{}]
    const tone: Tone = options?.tone ?? (list.some((b) => b.style === 'destructive') ? 'danger' : 'info')
    if (host) host({ title, message, buttons: list, tone, icon: options?.icon })
    else RNAlert.alert(title, message, buttons as any) // before the host is ready, use the phone's own alert
  },
}

const DEFAULT_ICON: Record<Tone, Icon> = { success: 'check-circle', error: 'alert-circle', warning: 'alert-triangle', info: 'info', danger: 'trash-2' }

export function AppAlertHost() {
  const { colors, t } = useSettings()
  const [data, setData] = useState<Data | null>(null)
  const anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    host = (d) => setData(d)
    return () => { host = null }
  }, [])

  useEffect(() => {
    if (!data) return
    anim.setValue(0)
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8, tension: 90 }).start()
  }, [data, anim])

  if (!data) return null

  const close = (after?: () => void) => {
    Animated.timing(anim, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setData(null)
      after?.()
    })
  }

  const tone = {
    success: { fg: colors.green, bg: colors.greenbg },
    error: { fg: colors.red, bg: colors.redbg },
    danger: { fg: colors.red, bg: colors.redbg },
    warning: { fg: colors.amber, bg: colors.amberbg },
    info: { fg: colors.pri, bg: `${colors.pri}1f` },
  }[data.tone]

  const buttons = data.buttons
  const cancel = buttons.find((b) => b.style === 'cancel')
  const actions = buttons.filter((b) => b.style !== 'cancel')
  const label = (b: DialogButton) => b.text ?? t('ok')
  // tapping outside = the cancel button, or the only button
  const dismiss = () => {
    if (cancel) close(cancel.onPress)
    else if (buttons.length === 1) close(buttons[0].onPress)
  }

  const Filled = ({ b, flex }: { b: DialogButton; flex?: boolean }) => {
    const bg = b.style === 'destructive' || data.tone === 'danger' || data.tone === 'error' ? colors.red : data.tone === 'success' ? colors.green : colors.btn
    return (
      <Pressable
        onPress={() => close(b.onPress)}
        style={({ pressed }) => ({ flex: flex ? 1 : undefined, height: 48, borderRadius: 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
      >
        <T w="bold" size={15} color="#fff">{label(b)}</T>
      </Pressable>
    )
  }
  const Ghost = ({ b, flex }: { b: DialogButton; flex?: boolean }) => (
    <Pressable
      onPress={() => close(b.onPress)}
      style={({ pressed }) => ({ flex: flex ? 1 : undefined, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
    >
      <T w="semibold" size={15} color={b.style === 'cancel' ? colors.muted : colors.pri}>{label(b)}</T>
    </Pressable>
  )

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={dismiss}>
      <Animated.View style={{ flex: 1, opacity: anim, backgroundColor: 'rgba(8,20,24,0.55)' }}>
        <Pressable style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }} onPress={dismiss}>
          <Animated.View style={{ width: '100%', maxWidth: 360, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}>
            <Pressable
              onPress={() => {}}
              style={{ backgroundColor: colors.card, borderRadius: 24, paddingHorizontal: 22, paddingTop: 26, paddingBottom: 20, alignItems: 'center', borderWidth: 1, borderColor: colors.line }}
            >
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <Feather name={data.icon ?? DEFAULT_ICON[data.tone]} size={30} color={tone.fg} />
              </View>
              <T w="bold" size={18} style={{ textAlign: 'center' }}>{data.title}</T>
              {data.message ? <T size={14} color={colors.muted} style={{ textAlign: 'center', marginTop: 8, lineHeight: 20 }}>{data.message}</T> : null}

              <View style={{ alignSelf: 'stretch', marginTop: 22, gap: 10 }}>
                {buttons.length >= 3 ? (
                  <>
                    {actions.map((b, i) => <Ghost key={i} b={b} />)}
                    {cancel ? (
                      <Pressable onPress={() => close(cancel.onPress)} style={{ alignItems: 'center', paddingVertical: 8 }}>
                        <T w="semibold" size={14.5} color={colors.muted}>{label(cancel)}</T>
                      </Pressable>
                    ) : null}
                  </>
                ) : buttons.length === 2 ? (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {cancel ? <Ghost b={cancel} flex /> : <Ghost b={buttons[0]} flex />}
                    <Filled b={cancel ? actions[0] : buttons[1]} flex />
                  </View>
                ) : (
                  <Filled b={buttons[0]} />
                )}
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  )
}
