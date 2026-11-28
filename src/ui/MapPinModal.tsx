/*
| Full-screen map to set the exact spot of a property.
| - tap on the map or drag the pin to move it
| - "Use my current location" jumps the pin to where the phone is
| The map is Google Maps (Maps JavaScript API) inside a WebView, so small shops and landmarks show up.
| It needs EXPO_PUBLIC_GOOGLE_MAPS_KEY in .env (and in eas.json for builds). See .env.example.
| Render it only while it should be open (like Sheet).
*/
import React, { useRef, useState } from 'react'
import { Modal, Platform, Pressable, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { useSettings } from '../settings/SettingsProvider'
import { Alert } from './AppAlert'
import { Button } from './Button'
import { T } from './AppText'
import { LocationError, getCurrentPin, pinText, type Pin } from '../utils/location'

// middle of India, zoomed out, when no pin is set yet
const INDIA = { lat: 22.5, lng: 79.0, zoom: 4 }

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? ''
// The WebView tells Google which website is asking. Put the same address in the key's "HTTP referrers" restriction.
const MAP_BASE_URL = 'https://kirayasaathi.in'

function buildHtml(initial: Pin | null) {
  const start = initial ? { lat: initial.lat, lng: initial.lng, zoom: 17, has: true } : { ...INDIA, has: false }
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>html,body,#map{height:100%;margin:0;padding:0}</style>
</head><body><div id="map"></div>
<script>
var start = ${JSON.stringify(start)};
var map = null, marker = null, pending = null;
function post(o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
// Google calls this when the key is wrong, restricted for another site, or billing is off
window.gm_authFailure = function () { post({ error: 'load' }); };
function send() {
  var p = marker.position;
  post({ lat: typeof p.lat === 'function' ? p.lat() : p.lat, lng: typeof p.lng === 'function' ? p.lng() : p.lng });
}
function setPin(lat, lng, fly) {
  if (!map) { pending = { lat: lat, lng: lng }; return; }
  var pos = { lat: lat, lng: lng };
  if (!marker) {
    marker = new google.maps.marker.AdvancedMarkerElement({ map: map, position: pos, gmpDraggable: true });
    marker.addListener('dragend', send);
  } else {
    marker.position = pos;
  }
  if (fly) { map.setCenter(pos); if (map.getZoom() < 17) map.setZoom(17); }
}
async function initMap() {
  try {
    await google.maps.importLibrary('maps');
    await google.maps.importLibrary('marker');
  } catch (e) { post({ error: 'load' }); return; }
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: start.lat, lng: start.lng }, zoom: start.zoom,
    mapId: 'DEMO_MAP_ID',            // Advanced markers need a map id; this demo id is free
    gestureHandling: 'greedy',       // one finger moves the map inside the app
    mapTypeControl: true,            // Map / Satellite
    streetViewControl: false, fullscreenControl: false, clickableIcons: true
  });
  // a tap on a shop or landmark icon puts the pin on it (no popup)
  map.addListener('click', function (e) {
    if (e.stop) e.stop();
    setPin(e.latLng.lat(), e.latLng.lng(), false);
    send();
  });
  if (start.has) setPin(start.lat, start.lng, false);
  if (pending) { setPin(pending.lat, pending.lng, true); pending = null; }
}
</script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_KEY)}&loading=async&v=weekly&region=IN&callback=initMap"></script>
</body></html>`
}

export function MapPinModal({ initial, onClose, onDone }: { initial: Pin | null; onClose: () => void; onDone: (p: Pin) => void }) {
  const { t, colors } = useSettings()
  const insets = useSafeAreaInsets()
  const web = useRef<WebView>(null)
  const [source] = useState(() => ({ html: buildHtml(initial), baseUrl: MAP_BASE_URL }))
  const [mapError, setMapError] = useState(false)
  const [pin, setPin] = useState<Pin | null>(initial)
  const [locating, setLocating] = useState(false)

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data) as { lat?: unknown; lng?: unknown; error?: unknown }
      if (m.error) { setMapError(true); return }
      if (typeof m.lat === 'number' && typeof m.lng === 'number') setPin({ lat: m.lat, lng: m.lng })
    } catch {
      // not our message, ignore
    }
  }

  const useMyLocation = async () => {
    setLocating(true)
    try {
      const p = await getCurrentPin()
      setPin(p)
      web.current?.injectJavaScript(`setPin(${p.lat}, ${p.lng}, true); true;`)
    } catch (e) {
      const denied = e instanceof LocationError && e.code === 'DENIED'
      Alert.alert(t('error'), denied ? t('locDenied') : t('locFail'), undefined, { tone: 'warning' })
    } finally {
      setLocating(false)
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
          <T w="bold" size={17} style={{ flex: 1 }} numberOfLines={1}>{t('pinT')}</T>
          <Pressable onPress={onClose} hitSlop={10}>
            <Feather name="x" size={24} color={colors.muted} />
          </Pressable>
        </View>
        <T size={12.5} color={colors.muted} style={{ paddingHorizontal: 16, paddingBottom: 8 }}>{t('pinTapHint')}</T>

        <View style={{ flex: 1, backgroundColor: colors.line }}>
          {Platform.OS === 'web' ? (
            <T color={colors.muted} style={{ padding: 16 }}>{t('mapAppOnly')}</T>
          ) : !GOOGLE_KEY ? (
            <T color={colors.red} style={{ padding: 16 }}>{t('mapKeyMissing')}</T>
          ) : mapError ? (
            <T color={colors.red} style={{ padding: 16 }}>{t('mapLoadFail')}</T>
          ) : (
            <WebView
              ref={web}
              source={source}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              onMessage={onMessage}
              onError={() => setMapError(true)}
              onHttpError={() => setMapError(true)}
              style={{ flex: 1, backgroundColor: colors.line }}
            />
          )}
        </View>

        <View style={{ padding: 16, paddingBottom: insets.bottom + 16, gap: 10 }}>
          <T w="semibold" size={13} color={pin ? colors.green : colors.muted}>
            {pin ? `${t('pinSet')}: ${pinText(pin.lat, pin.lng)}` : t('pinNotSet')}
          </T>
          <Button title={t('useCurrent')} variant="ghost" onPress={useMyLocation} loading={locating} />
          <Button title={t('pinDone')} onPress={() => pin && onDone(pin)} disabled={!pin} />
        </View>
      </View>
    </Modal>
  )
}
