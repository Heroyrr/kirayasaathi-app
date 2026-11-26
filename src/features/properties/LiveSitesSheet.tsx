import { Image, Linking, View } from "react-native";
import { listingPhotoUrl } from "../../api/client";
import type { LiveSite } from "../../api/types";
import { useSettings } from "../../settings/SettingsProvider";
import { Alert } from "../../ui/AppAlert";
import { T } from "../../ui/AppText";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Sheet } from "../../ui/Sheet";
import { siteUrl } from "../../utils/listing";

/** Round logo of a website; without a logo, the first letter of its name */
function SiteMark({ site }: { site: LiveSite }) {
  const { colors } = useSettings();
  if (site.logo_key) {
    return (
      <Image
        source={{ uri: listingPhotoUrl(site.logo_key) }}
        style={{
          width: 42,
          height: 42,
          borderRadius: 11,
          backgroundColor: colors.line,
        }}
      />
    );
  }
  return (
    <View
      style={{
        width: 42,
        height: 42,
        borderRadius: 11,
        backgroundColor: colors.greenbg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <T w="bold" size={18} color={colors.green}>
        {site.name.trim().charAt(0).toUpperCase()}
      </T>
    </View>
  );
}

/**
 * Opens after a property is live: every website it shows on, each with a "See live" button.
 * The button opens that website's search for this property.
 */
export function LiveSitesSheet({
  propertyName,
  propertyId,
  shareUrl,
  sites,
  onClose,
}: {
  propertyName: string;
  propertyId: number;
  shareUrl?: string | null;
  sites: LiveSite[];
  onClose: () => void;
}) {
  const { t, colors } = useSettings();

  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t("error"), url, undefined, { tone: "error" });
    }
  };

  return (
    <Sheet title={t("seeLiveT")} onClose={onClose}>
      <T size={12.5} color={colors.muted} style={{ marginBottom: 10 }}>
        {t("seeLiveH")}
      </T>
      {sites.map((s) => {
        // main site: the same property link we share on a lead; partner sites keep their own search link
        const url =
          s.main && shareUrl ? shareUrl : siteUrl(s, propertyName, propertyId);
        return (
          <Card key={s.slug}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <SiteMark site={s} />
              <View style={{ flex: 1 }}>
                <T w="bold" size={15} numberOfLines={1}>
                  {s.name}
                </T>
                {!url ? (
                  <T size={11.5} color={colors.muted}>
                    {t("siteNoLink")}
                  </T>
                ) : null}
              </View>
              {url ? (
                <Button
                  title={t("seeLive")}
                  onPress={() => open(url)}
                  style={{ height: 38, paddingHorizontal: 16 }}
                />
              ) : null}
            </View>
          </Card>
        );
      })}
    </Sheet>
  );
}
