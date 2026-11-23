import * as Location from 'expo-location'

export type Pin = { lat: number; lng: number }
export class LocationError extends Error {
  constructor(public code: 'DENIED' | 'FAILED') { super(code) }
}

/** Asks for the permission (first time only) and reads where the phone is right now */
export async function getCurrentPin(): Promise<Pin> {
  const perm = await Location.requestForegroundPermissionsAsync()
  if (perm.status !== 'granted') throw new LocationError('DENIED')
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  } catch {
    throw new LocationError('FAILED') // GPS is off or no signal
  }
}

/** 26.76060, 83.37320 */
export const pinText = (lat: number | null | undefined, lng: number | null | undefined) =>
  typeof lat === 'number' && typeof lng === 'number' ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : ''
