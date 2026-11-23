import * as ImagePicker from 'expo-image-picker'

export type Picked = { uri: string; mime: string }

// The picker hands over the photo as base64 too. We keep it here until it is uploaded,
// because reading a phone file again is not reliable on every device.
const base64Cache = new Map<string, string>()
export const takeBase64 = (uri: string) => base64Cache.get(uri)
export const dropBase64 = (uri: string) => { base64Cache.delete(uri) }

/** Camera or gallery. Returns null when cancelled; calls onDenied when the camera permission is refused. */
export async function pickImage(camera: boolean, onDenied?: () => void): Promise<Picked | null> {
  if (camera) {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      onDenied?.()
      return null
    }
  }
  const res = camera
    ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true })
    : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true })
  if (res.canceled || !res.assets[0]) return null
  const a = res.assets[0]
  if (a.base64) base64Cache.set(a.uri, a.base64)
  return { uri: a.uri, mime: a.mimeType ?? 'image/jpeg' }
}

/** Gallery, many photos at once. Returns [] when cancelled. */
export async function pickImages(limit: number): Promise<Picked[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    quality: 0.6,
    base64: true,
    allowsMultipleSelection: true,
    selectionLimit: Math.max(1, limit),
  })
  if (res.canceled) return []
  return res.assets.slice(0, limit).map((a) => {
    if (a.base64) base64Cache.set(a.uri, a.base64)
    return { uri: a.uri, mime: a.mimeType ?? 'image/jpeg' }
  })
}
