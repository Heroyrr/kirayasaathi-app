import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import type { Lead, Property } from "../../api/types";
import { useAction } from "../../hooks/useAction";
import { useSettings } from "../../settings/SettingsProvider";
import { useUpdateLeadMutation } from "../../store/api/leads";
import { useGetPropertiesQuery } from "../../store/api/properties";
import { T } from "../../ui/AppText";
import { Button } from "../../ui/Button";
import { Loader } from "../../ui/Loader";
import { Sheet } from "../../ui/Sheet";
import { inr } from "../../utils/format";

const MAX = 5;

/** One property in the message: name, place, rent and the GharSaathi link */
export const block = (p: Property, from: string) => {
  const place = [p.locality, p.city].filter((x) => x && x.trim()).join(", ");
  const rent = p.min_rent != null ? `${from} ${inr(p.min_rent)}` : "";
  return [
    `*${p.name}*`,
    [place, rent].filter(Boolean).join(" · "),
    p.share_url ?? "",
  ]
    .filter(Boolean)
    .join("\n");
};

/**
 * Lead detail > Share property.
 * The owner ticks one or many properties (the ones the lead asked about are ticked already) and ONE WhatsApp message
 * with every GharSaathi link goes to the lead. A "sent" line is added to the lead's talk history.
 */
export function ShareLinkSheet({
  lead,
  onClose,
}: {
  lead: Lead;
  onClose: () => void;
}) {
  const { t, colors } = useSettings();
  const { run } = useAction();
  const q = useGetPropertiesQuery();
  const [update] = useUpdateLeadMutation();
  const list = q.data ?? [];
  const sendable = (p: Property) => p.is_live && !!p.share_url;

  const asked = (
    lead.properties?.length
      ? lead.properties
      : lead.property
        ? [lead.property]
        : []
  ).map((x) => x.id);
  const [picked, setPicked] = useState<number[] | null>(null); // null = not touched yet: use what the lead asked about
  const chosen = (
    picked ?? asked.filter((id) => list.some((p) => p.id === id && sendable(p)))
  ).slice(0, MAX);
  const noSite = list.some((p) => p.is_live) && !list.some((p) => p.share_url); // live properties exist, but no website address yet

  const toggle = (p: Property) => {
    if (!sendable(p)) return;
    const cur = chosen;
    if (cur.includes(p.id)) setPicked(cur.filter((x) => x !== p.id));
    else if (cur.length < MAX) setPicked([...cur, p.id]);
  };

  const send = async () => {
    const props = list.filter((p) => chosen.includes(p.id));
    if (!props.length) return;
    const text = [
      t("shareMsgIntro", { name: lead.name }),
      "",
      props.map((p) => block(p, t("shareFrom"))).join("\n\n"),
    ].join("\n");
    const url = lead.phone
      ? `https://wa.me/91${lead.phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    try {
      await Linking.openURL(url);
    } catch {
      return;
    }
    // note it in the lead's history (the message is already out, so a failure here is not shown as an error)
    await run(() =>
      update({
        id: lead.id,
        last_talk: t("shareLog", {
          names: props.map((p) => p.name).join(", "),
        }),
      }).unwrap(),
    ).catch(() => {});
    onClose();
  };

  return (
    <Sheet title={t("shareT")} onClose={onClose}>
      {q.isLoading ? (
        <Loader />
      ) : list.length === 0 ? (
        <T size={13} color={colors.muted}>
          {t("shareNone")}
        </T>
      ) : (
        <>
          <T size={12.5} color={colors.muted} style={{ marginBottom: 6 }}>
            {t("shareH", { n: MAX })}
          </T>
          {noSite ? (
            <T size={12.5} color={colors.amber} style={{ marginBottom: 8 }}>
              {t("shareNoSite")}
            </T>
          ) : null}
          {list.map((p) => {
            const on = chosen.includes(p.id);
            const ok = sendable(p);
            return (
              <Pressable
                key={p.id}
                onPress={() => toggle(p)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 11,
                  borderTopWidth: 1,
                  borderTopColor: colors.line,
                  opacity: ok ? 1 : 0.5,
                }}
              >
                <Feather
                  name={on ? "check-square" : "square"}
                  size={22}
                  color={on ? colors.pri : colors.muted}
                />
                <View style={{ flex: 1 }}>
                  <T w="semibold" size={14.5} numberOfLines={1}>
                    {p.name}
                  </T>
                  <T size={12} color={colors.muted} numberOfLines={1}>
                    {[p.locality, p.city]
                      .filter((x) => x && x.trim())
                      .join(", ")}
                    {p.min_rent != null
                      ? `${p.locality || p.city ? " · " : ""}${inr(p.min_rent)}`
                      : ""}
                  </T>
                </View>
                {!p.is_live ? (
                  <T size={11.5} color={colors.muted}>
                    {t("shareNotLive")}
                  </T>
                ) : null}
              </Pressable>
            );
          })}
          {chosen.length >= MAX ? (
            <T size={12} color={colors.muted} style={{ marginTop: 6 }}>
              {t("shareMax", { n: MAX })}
            </T>
          ) : null}
          <View style={{ height: 12 }} />
          <Button
            title={`${t("shareSend")}${chosen.length ? ` (${chosen.length})` : ""}`}
            onPress={send}
            disabled={chosen.length === 0}
          />
        </>
      )}
    </Sheet>
  );
}
