import Constants from 'expo-constants';
import { useEffect, useMemo, useRef } from 'react';
import { Platform, View } from 'react-native';
import MapView, { Circle, Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { DARK_MAP_STYLE } from '../lib/googleMaps';
import { bounds } from '../logic/live';
import { colors } from '../theme';
import type { GoogleMapProps } from './GoogleMap.types';

/**
 * Native Google Map (react-native-maps). Android always uses Google Maps; iOS
 * uses Google Maps when an iOS key is configured (app.config.js), otherwise
 * Apple Maps (e.g. inside Expo Go, which can't load the Google SDK on iOS).
 */
const iosHasGoogle = !!(Constants.expoConfig?.extra as { googleMapsIos?: boolean } | undefined)?.googleMapsIos;
const provider = Platform.OS === 'android' || iosHasGoogle ? PROVIDER_GOOGLE : undefined;

export function GoogleMap({ route = [], routes = [], markers = [], me, followMe, center, zoom = 13, height = 260, style, testID }: GoogleMapProps) {
  const ref = useRef<MapView>(null);
  const fitKey = JSON.stringify([route.length, routes.map((r) => r.points.length), markers.map((m) => m.id)]);

  const initial: Region = useMemo(() => {
    const pts = [...route, ...routes.flatMap((r) => r.points), ...markers, ...(me ? [me] : []), ...(center ? [center] : [])];
    const b = bounds(pts);
    const delta = 360 / 2 ** zoom;
    return b ?? { latitude: 20.59, longitude: 78.96, latitudeDelta: delta * 20, longitudeDelta: delta * 20 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit to content when it changes
  useEffect(() => {
    if (followMe) return;
    const pts = [...route, ...routes.flatMap((r) => r.points), ...markers, ...(me ? [me] : [])].map((p) => ({ latitude: p.lat, longitude: p.lng }));
    if (pts.length > 1) ref.current?.fitToCoordinates(pts, { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, followMe]);

  // Follow the user
  useEffect(() => {
    if (followMe && me) ref.current?.animateCamera({ center: { latitude: me.lat, longitude: me.lng } }, { duration: 600 });
  }, [followMe, me?.lat, me?.lng, me]);

  return (
    <View style={[{ height, borderRadius: 20, overflow: 'hidden', backgroundColor: '#EEF0F7' }, style]} testID={testID}>
      <MapView
        ref={ref}
        provider={provider}
        style={{ flex: 1 }}
        initialRegion={initial}
        customMapStyle={provider === PROVIDER_GOOGLE ? DARK_MAP_STYLE : undefined}
        userInterfaceStyle="dark"
        showsUserLocation={!!me}
        showsMyLocationButton
        showsCompass
        toolbarEnabled={false}>
        {route.length > 1 && (
          <Polyline coordinates={route.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={colors.cyan} strokeWidth={5} />
        )}
        {routes.map((r) =>
          r.points.length > 1 ? (
            <Polyline key={r.id} coordinates={r.points.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={r.color ?? colors.violet} strokeWidth={4} />
          ) : null,
        )}
        {route.length > 0 && <Marker coordinate={{ latitude: route[0].lat, longitude: route[0].lng }} pinColor="green" title="Start" />}
        {markers.map((m) => (
          <Marker key={m.id} coordinate={{ latitude: m.lat, longitude: m.lng }} title={m.title} description={m.description} pinColor={m.color ?? colors.pink} onCalloutPress={m.onPress} />
        ))}
        {me?.accuracy ? (
          <Circle center={{ latitude: me.lat, longitude: me.lng }} radius={me.accuracy} fillColor="rgba(59,130,246,0.15)" strokeColor="rgba(59,130,246,0.5)" />
        ) : null}
      </MapView>
    </View>
  );
}
