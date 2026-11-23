/*
| Push notifications (Android, Firebase Cloud Messaging through the Expo push service).
| - pushPermission(): is the phone allowing notifications? 'granted' | 'ask' | 'blocked'
| - enablePush(): asks the permission (system popup), gets the Expo push token, saves it on the server
| - registerForPush(): same but silent: it never opens the system popup (used when the app starts)
| - unregisterPush(): removes the token again (logout, or the owner switches notifications off)
| Push does not work in Expo Go or on the web: those cases return quietly. Test on a real build (see docs/FIREBASE_PUSH_SETUP.md).
*/
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "../../api/client";
import { appStorage } from "../../utils/appStorage";

const TOKEN_KEY = "oa_push_token";
export const PUSH_CHANNEL = "default"; // must match defaultChannel in app.json and channelId in the Edge Function

export const pushSupported = () => {
  if (Platform.OS === "web") return false;
  // Expo Go cannot do push on Android (SDK 53+). Check every way Expo Go can identify itself.
  const inExpoGo =
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    (Constants as any).appOwnership === "expo";
  return !inExpoGo;
};

// Show the notification as a normal banner (with sound) even while the app is open
if (pushSupported()) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {}
}

export type PushPermission = "granted" | "ask" | "blocked";

/** granted: allowed. ask: the system popup can still be shown. blocked: the owner must open the phone settings */
export async function pushPermission(): Promise<PushPermission> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return "granted";
    return p.canAskAgain ? "ask" : "blocked";
  } catch {
    return "ask";
  }
}

async function ensureChannel() {
  if (Platform.OS !== "android") return;
  // Android needs the channel BEFORE the permission popup and the token (Android 13+).
  // MAX importance = heads-up banner on top of the screen, sound and vibration.
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL, {
    name: "KirayaSaathi",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#0F5C68",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: true,
  });
}

async function saveToken(): Promise<string | null> {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return null;
  const { data: token } = await Notifications.getExpoPushTokenAsync({
    projectId,
  });
  await api("/push-token", {
    method: "POST",
    body: { token, platform: Platform.OS },
  });
  await appStorage.set(TOKEN_KEY, token);
  return token;
}

/** Silent: saves the token only when the permission is already given. Never opens the system popup. */
export async function registerForPush(): Promise<string | null> {
  if (!pushSupported() || !Device.isDevice) return null;
  await ensureChannel();
  if ((await pushPermission()) !== "granted") return null;
  return saveToken();
}

export type EnableResult = "ok" | "denied" | "blocked" | "unsupported" | "error";

/** Opens the system permission popup if needed, then saves the token */
export async function enablePush(): Promise<EnableResult> {
  if (!pushSupported() || !Device.isDevice) return "unsupported";
  try {
    await ensureChannel();
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain)
      perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return perm.canAskAgain ? "denied" : "blocked";
    await saveToken();
    return "ok";
  } catch {
    return "error";
  }
}

export async function unregisterPush(): Promise<void> {
  const token = await appStorage.get(TOKEN_KEY);
  if (!token) return;
  try {
    await api("/push-token", { method: "DELETE", body: { token } });
  } finally {
    await appStorage.remove(TOKEN_KEY);
  }
}
