import { Alert } from '../ui/AppAlert'
import { useSettings } from '../settings/SettingsProvider'
import { pickImage, type Picked } from '../utils/pickImage'

/** Asks "camera or gallery?" and returns the chosen image (or null) */
export function usePickPhoto() {
  const { t } = useSettings()
  const denied = () => Alert.alert(t('error'), t('camDenied'), undefined, { tone: 'warning', icon: 'camera-off' })
  return (): Promise<Picked | null> =>
    new Promise((resolve) => {
      Alert.alert(t('photo'), undefined, [
        { text: t('takePhoto'), onPress: () => pickImage(true, denied).then(resolve) },
        { text: t('gallery'), onPress: () => pickImage(false).then(resolve) },
        { text: t('cancel'), style: 'cancel', onPress: () => resolve(null) },
      ], { tone: 'info', icon: 'camera' })
    })
}
