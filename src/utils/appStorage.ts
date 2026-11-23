/*
| Small saved storage for the login copy, the language and the theme.
| - on the phone: SecureStore (encrypted)
| - in the browser: expo-secure-store does not exist there ("setValueWithKeyAsync is not a function"),
|   so the browser storage is used instead
| - while Expo builds the web page on a server there is no storage at all: reads give null, writes do nothing
| It never throws, so a storage problem can never stop the login.
*/
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'

const web = Platform.OS === 'web'
const noStorage = () => web && typeof window === 'undefined'

export const appStorage = {
  async get(key: string): Promise<string | null> {
    if (noStorage()) return null
    try { return web ? await AsyncStorage.getItem(key) : await SecureStore.getItemAsync(key) } catch { return null }
  },
  async set(key: string, value: string): Promise<void> {
    if (noStorage()) return
    try { if (web) await AsyncStorage.setItem(key, value); else await SecureStore.setItemAsync(key, value) } catch {}
  },
  async remove(key: string): Promise<void> {
    if (noStorage()) return
    try { if (web) await AsyncStorage.removeItem(key); else await SecureStore.deleteItemAsync(key) } catch {}
  },
}
