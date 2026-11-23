import { Feather } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { AppState, Linking, Modal, Pressable, View } from "react-native";
import { useSettings } from "../../settings/SettingsProvider";
import { baseApi } from "../../store/baseApi";
import { useAppDispatch } from "../../store";
import { useGetNotificationsQuery } from "../../store/api/notifications";
import { Button } from "../../ui/Button";
import { T } from "../../ui/AppText";
import { appStorage } from "../../utils/appStorage";
import {
  enablePush,
  pushPermission,
  pushSupported,
  registerForPush,
  type PushPermission,
} from "./push";

// Only plain in-app paths are allowed, for example /leads/12 or /notices
const SAFE_PATH = /^\/[A-Za-z0-9/_-]*$/;
const SNOOZE_KEY = "oa_push_snooze";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // after "Not now" ask again in 3 days

/**
 * Mount this once while the owner is logged in.
 * 1. right after login it asks (with a friendly popup) to allow notifications, like other apps do
 * 2. saves the phone's push token on the server (only while the owner keeps notifications ON in More)
 * 3. opens the right screen when the owner taps a notification: app closed, in the background or open
 * 4. refreshes the bell badge when a notification arrives
 */
export function PushSetup() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { t, colors } = useSettings();
  const pref = useGetNotificationsQuery();
  const wantPush = pref.data?.push_enabled; // undefined while loading
  const wantRef = useRef(false);
  wantRef.current = wantPush === true;
  const [prompt, setPrompt] = useState<null | "ask" | "blocked">(null);
  const [busy, setBusy] = useState(false);

  // ---- listeners: taps, new notifications, token changes ----
  useEffect(() => {
    if (!pushSupported()) return;

    const subs: { remove: () => void }[] = [];
    try {
      // Firebase can change the phone's token while the app runs: save the new one
      subs.push(
        Notifications.addPushTokenListener(() => {
          if (wantRef.current) registerForPush().catch(() => {});
        }),
      );

      // a notification arrived while the app is open: update the bell badge and list
      subs.push(
        Notifications.addNotificationReceivedListener(() => {
          dispatch(baseApi.util.invalidateTags(["Notices"]));
        }),
      );

      const open = (n: Notifications.Notification, delay = 0) => {
        dispatch(baseApi.util.invalidateTags(["Notices"]));
        const url = n.request.content.data?.url;
        if (typeof url !== "string" || !SAFE_PATH.test(url)) return;
        setTimeout(() => router.push(url as any), delay);
      };

      // app was closed and the owner tapped a notification to start it
      const last = Notifications.getLastNotificationResponse();
      if (
        last?.notification &&
        last.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
      ) {
        open(last.notification, 400);
        Notifications.clearLastNotificationResponse();
      }

      // app was open or in the background
      subs.push(
        Notifications.addNotificationResponseReceivedListener((response) => {
          if (
            response.actionIdentifier !==
            Notifications.DEFAULT_ACTION_IDENTIFIER
          )
            return;
          open(response.notification);
          Notifications.clearLastNotificationResponse();
        }),
      );
    } catch (e) {
      // push is not available here (for example Expo Go): the rest of the app keeps working
      console.log("Push disabled:", e instanceof Error ? e.message : e);
    }

    return () => subs.forEach((s) => s.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- permission + token, once we know the owner wants notifications ----
  const check = async () => {
    if (!pushSupported() || !wantRef.current) return;
    try {
      const perm: PushPermission = await pushPermission();
      if (perm === "granted") {
        setPrompt(null);
        registerForPush().catch(() => {});
        return;
      }
      const at = Number(await appStorage.get(SNOOZE_KEY)) || 0;
      if (Date.now() - at < SNOOZE_MS) return; // the owner said "Not now" recently
      setPrompt(perm); // "ask" or "blocked"
    } catch {}
  };

  useEffect(() => {
    if (wantPush === undefined) return;
    if (wantPush) check();
    else setPrompt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantPush]);

  // coming back from the phone settings: check again
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && wantRef.current) check();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const later = async () => {
    setPrompt(null);
    await appStorage.set(SNOOZE_KEY, String(Date.now()));
  };

  const allow = async () => {
    if (prompt === "blocked") {
      setPrompt(null);
      Linking.openSettings().catch(() => {});
      return;
    }
    setBusy(true);
    const r = await enablePush();
    setBusy(false);
    setPrompt(null);
    if (r !== "ok") await appStorage.set(SNOOZE_KEY, String(Date.now()));
  };

  if (!prompt) return null;
  const blocked = prompt === "blocked";
  return (
    <Modal visible transparent animationType="fade" onRequestClose={later} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <View style={{ width: "100%", maxWidth: 380, backgroundColor: colors.card, borderRadius: 22, padding: 22, alignItems: "center", gap: 10 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: `${colors.pri}22`, alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
            <Feather name={blocked ? "bell-off" : "bell"} size={32} color={colors.pri} />
          </View>
          <T w="bold" size={18} style={{ textAlign: "center" }}>{blocked ? t("ppBlockedT") : t("ppT")}</T>
          <T size={13.5} color={colors.muted} style={{ textAlign: "center", marginBottom: 8 }}>{blocked ? t("ppBlockedB") : t("ppB")}</T>
          <Button title={blocked ? t("pushOpen") : t("ppAllow")} onPress={allow} loading={busy} style={{ alignSelf: "stretch" }} />
          <Pressable onPress={later} hitSlop={8} style={{ paddingVertical: 10 }}>
            <T w="semibold" size={13.5} color={colors.muted}>{t("ppLater")}</T>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
