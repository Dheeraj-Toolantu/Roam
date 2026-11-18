/// <reference types="google.maps" />
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { DARK_MAP_STYLE, GOOGLE_MAPS_API_KEY, googleMapsAuthFailed, loadGoogleMapsWeb, onGoogleMapsAuthFailure } from '../lib/googleMaps';
import { colors, type } from '../theme';
import type { GoogleMapProps } from './GoogleMap.types';
import { RouteMap } from './maps';

/**
 * Web Google Map using the Maps JavaScript API. Falls back to the built-in SVG
 * map if Google Maps can't be loaded (offline / blocked), so screens never break.
 */
export function GoogleMap(props: GoogleMapProps) {
  const { route = [], routes = [], markers = [], me, followMe, center, zoom = 13, height = 260, style, testID } = props;
  const el = useRef<HTMLDivElement | null>(null);
  const map = useRef<google.maps.Map | null>(null);
  const layers = useRef<{ setMap: (m: google.maps.Map | null) => void }[]>([]);
  const meLayers = useRef<{ dot?: google.maps.Marker; acc?: google.maps.Circle }>({});
  const fitted = useRef<string>('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(() => (googleMapsAuthFailed() ? 'failed' : 'loading'));
  // Google can reject the key after the map was created: switch to the offline map then too.
  useEffect(() => onGoogleMapsAuthFailure(() => setStatus('failed')), []);
  // Redraw overlays only when their content changes (not on every live-location re-render).
  const contentKey = JSON.stringify([route, routes, markers.map(({ onPress: _onPress, ...m }) => m)]);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  // Create the map once
  useEffect(() => {
    let cancelled = false;
    loadGoogleMapsWeb()
      .then((maps) => {
        if (cancelled || !el.current) return;
        map.current = new maps.Map(el.current, {
          center: center ?? me ?? route[0] ?? { lat: 20.59, lng: 78.96 },
          zoom,
          styles: DARK_MAP_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: false,
          gestureHandling: 'greedy',
          backgroundColor: '#EEF0F7',
        });
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('failed'));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Route, extra routes and markers
  useEffect(() => {
    const m = map.current;
    if (status !== 'ready' || !m) return;
    const { route = [], routes = [], markers = [], me, followMe, zoom = 13 } = latest.current;
    const g = google.maps;
    layers.current.forEach((l) => l.setMap(null));
    layers.current = [];
    const line = (pts: { lat: number; lng: number }[], color: string, width: number) => {
      if (pts.length < 2) return;
      layers.current.push(new g.Polyline({ map: m, path: pts, strokeColor: color, strokeWeight: width, strokeOpacity: 0.95 }));
    };
    line(route, colors.cyan, 5);
    routes.forEach((r) => line(r.points, r.color ?? colors.violet, 4));
    if (route.length) {
      layers.current.push(
        new g.Marker({ map: m, position: route[0], title: 'Start', icon: { path: g.SymbolPath.CIRCLE, scale: 7, fillColor: colors.green, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } }),
      );
    }
    markers.forEach((mk) => {
      const marker = new g.Marker({
        map: m,
        position: { lat: mk.lat, lng: mk.lng },
        title: mk.title,
        label: mk.label ? { text: mk.label, color: '#fff', fontSize: '10px', fontWeight: '700' } : undefined,
        icon: { path: g.SymbolPath.CIRCLE, scale: mk.label ? 13 : 8, fillColor: mk.color ?? colors.pink, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
      });
      if (mk.onPress) marker.addListener('click', mk.onPress);
      if (mk.title || mk.description) {
        const info = new g.InfoWindow({ content: `<div style="color:#111;font:13px system-ui"><b>${esc(mk.title ?? '')}</b><br/>${esc(mk.description ?? '')}</div>` });
        marker.addListener('mouseover', () => info.open({ map: m, anchor: marker }));
        marker.addListener('mouseout', () => info.close());
      }
      layers.current.push(marker);
    });
    // Fit once per distinct content set (not on every live update)
    const key = JSON.stringify([route.length, routes.map((r) => r.points.length), markers.map((x) => x.id)]);
    if (!followMe && key !== fitted.current) {
      fitted.current = key;
      const pts = [...route, ...routes.flatMap((r) => r.points), ...markers, ...(me ? [me] : [])];
      if (pts.length > 1) {
        const b = new g.LatLngBounds();
        pts.forEach((p) => b.extend(p));
        m.fitBounds(b, 48);
      } else if (pts.length === 1) {
        m.setCenter(pts[0]);
        m.setZoom(zoom);
      }
    }
  }, [status, contentKey]);

  // Live position dot + accuracy circle
  useEffect(() => {
    const m = map.current;
    if (status !== 'ready' || !m) return;
    const g = google.maps;
    const L = meLayers.current;
    if (!me) {
      L.dot?.setMap(null);
      L.acc?.setMap(null);
      meLayers.current = {};
      return;
    }
    const pos = { lat: me.lat, lng: me.lng };
    if (!L.dot) {
      L.dot = new g.Marker({
        map: m,
        position: pos,
        title: 'You are here',
        zIndex: 999,
        icon: { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: colors.blue, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
      });
      L.acc = new g.Circle({ map: m, center: pos, radius: me.accuracy ?? 0, fillColor: colors.blue, fillOpacity: 0.15, strokeColor: colors.blue, strokeOpacity: 0.4, strokeWeight: 1, clickable: false });
    } else {
      L.dot.setPosition(pos);
      L.acc?.setCenter(pos);
      L.acc?.setRadius(me.accuracy ?? 0);
    }
    if (followMe) m.panTo(pos);
  }, [status, me, followMe]);

  if (status === 'failed') {
    // Graceful degradation: built-in vector map
    return (
      <View testID={testID}>
        <RouteMap route={[...route, ...routes.flatMap((r) => r.points)]} pins={markers.map((m) => ({ lat: m.lat, lng: m.lng, color: m.color }))} current={me} height={height} style={style} />
        <Text style={[type.tiny, { marginTop: 4 }]} testID="map-offline-note">
          Google Maps unavailable — showing offline map.
        </Text>
      </View>
    );
  }

  return (
    <View style={[{ height, borderRadius: 20, overflow: 'hidden', backgroundColor: '#EEF0F7' }, style]} testID={testID}>
      <div ref={el} data-testid="google-map" data-has-key={GOOGLE_MAPS_API_KEY ? '1' : '0'} style={{ width: '100%', height: '100%' }} />
      {status === 'loading' && (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' } as never}>
          <Text style={type.small}>Loading Google Maps…</Text>
        </View>
      )}
    </View>
  );
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
