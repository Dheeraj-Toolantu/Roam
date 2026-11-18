import React, { useEffect, useMemo, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Rect, Stop, Text as SvgText, LinearGradient as SvgLinear } from 'react-native-svg';

import { CITIES } from '../data/cities';
import { colors } from '../theme';

type LatLng = { lat: number; lng: number };

/**
 * Stylised route map. Projects points with an equirectangular projection fitted
 * to the bounding box. `progress` (0..1) animates drawing of the route, used by
 * the cinematic video "Journey Route" scene.
 */
export function RouteMap({
  route,
  pins = [],
  height = 220,
  progress = 1,
  style,
  showGrid = true,
  current,
}: {
  route: LatLng[];
  pins?: (LatLng & { label?: string; color?: string; size?: number })[];
  height?: number;
  progress?: number;
  style?: StyleProp<ViewStyle>;
  showGrid?: boolean;
  current?: LatLng | null;
}) {
  const [w, setW] = useState(320);
  const all = [...route, ...pins, ...(current ? [current] : [])];
  const allKey = JSON.stringify(all);
  const pad = 28;
  const proj = useMemo(() => {
    const all = JSON.parse(allKey) as LatLng[];
    if (!all.length) return (_p: LatLng) => ({ x: w / 2, y: height / 2 });
    let minLat = Math.min(...all.map((p) => p.lat));
    let maxLat = Math.max(...all.map((p) => p.lat));
    let minLng = Math.min(...all.map((p) => p.lng));
    let maxLng = Math.max(...all.map((p) => p.lng));
    const minSpan = 0.01;
    if (maxLat - minLat < minSpan) { minLat -= minSpan; maxLat += minSpan; }
    if (maxLng - minLng < minSpan) { minLng -= minSpan; maxLng += minSpan; }
    const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
    const spanX = (maxLng - minLng) * kx;
    const spanY = maxLat - minLat;
    const scale = Math.min((w - pad * 2) / spanX, (height - pad * 2) / spanY);
    const offX = (w - spanX * scale) / 2;
    const offY = (height - spanY * scale) / 2;
    return (p: LatLng) => ({ x: offX + (p.lng - minLng) * kx * scale, y: offY + (maxLat - p.lat) * scale });
  }, [w, height, allKey]);

  const n = Math.max(1, Math.round(route.length * Math.max(0, Math.min(1, progress))));
  const shown = route.slice(0, n).map(proj);
  const d = shown.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const head = shown[shown.length - 1];
  const cur = current ? proj(current) : null;

  return (
    <View style={[{ height, borderRadius: 20, overflow: 'hidden', backgroundColor: '#EEF0F7' }, style]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Svg width={w} height={height}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="40%" r="70%">
            <Stop offset="0" stopColor="#1E2A6B" stopOpacity="1" />
            <Stop offset="1" stopColor="#0A0F2C" stopOpacity="1" />
          </RadialGradient>
          <SvgLinear id="route" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.cyan} />
            <Stop offset="1" stopColor={colors.purple} />
          </SvgLinear>
        </Defs>
        <Rect x={0} y={0} width={w} height={height} fill="url(#glow)" />
        {showGrid &&
          Array.from({ length: 12 }).map((_, i) => (
            <G key={i}>
              <Line x1={(i * w) / 11} y1={0} x2={(i * w) / 11} y2={height} stroke="#ffffff" strokeOpacity={0.05} />
              <Line x1={0} y1={(i * height) / 11} x2={w} y2={(i * height) / 11} stroke="#ffffff" strokeOpacity={0.05} />
            </G>
          ))}
        {shown.length > 1 && (
          <>
            <Path d={d} stroke={colors.cyan} strokeOpacity={0.25} strokeWidth={10} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Path d={d} stroke="url(#route)" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {route.length > 0 && (() => {
          const s = proj(route[0]);
          return <Circle cx={s.x} cy={s.y} r={6} fill={colors.green} stroke="#fff" strokeWidth={2} />;
        })()}
        {pins.map((p, i) => {
          const q = proj(p);
          return (
            <G key={i}>
              <Circle cx={q.x} cy={q.y} r={(p.size ?? 7) + 4} fill={(p.color ?? colors.pink) + '44'} />
              <Circle cx={q.x} cy={q.y} r={p.size ?? 7} fill={p.color ?? colors.pink} stroke="#fff" strokeWidth={2} />
              {!!p.label && (
                <SvgText x={q.x} y={q.y - 14} fill="#fff" fontSize={11} fontWeight="700" textAnchor="middle">
                  {p.label}
                </SvgText>
              )}
            </G>
          );
        })}
        {head && progress < 1 && <Circle cx={head.x} cy={head.y} r={7} fill={colors.cyan} stroke="#fff" strokeWidth={2} />}
        {cur && (
          <G>
            <Circle cx={cur.x} cy={cur.y} r={16} fill={colors.blue} fillOpacity={0.25} />
            <Circle cx={cur.x} cy={cur.y} r={7} fill={colors.blue} stroke="#fff" strokeWidth={2.5} />
          </G>
        )}
      </Svg>
    </View>
  );
}

/** Orthographic globe with graticule and city markers. Optional slow rotation. */
export function Globe({
  size = 240,
  markers = [],
  rotate = true,
  focus,
  highlightCountry,
}: {
  size?: number;
  markers?: (LatLng & { label?: string; color?: string; value?: number })[];
  rotate?: boolean;
  focus?: LatLng | null;
  highlightCountry?: string | null;
}) {
  const [spin, setSpin] = useState(focus ? -focus.lng : -70);
  const lambda = !rotate && focus ? -focus.lng : spin;
  const phi = focus ? -focus.lat * 0.6 : -15;
  useEffect(() => {
    if (!rotate) return;
    const t = setInterval(() => setSpin((l) => l + 0.6), 50);
    return () => clearInterval(t);
  }, [rotate]);

  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;
  const toRad = Math.PI / 180;
  const project = (p: LatLng) => {
    const l = (p.lng + lambda) * toRad;
    const f = p.lat * toRad;
    const f0 = phi * toRad;
    const cosc = Math.sin(f0) * Math.sin(f) + Math.cos(f0) * Math.cos(f) * Math.cos(l);
    const x = cx + r * Math.cos(f) * Math.sin(l);
    const y = cy - r * (Math.cos(f0) * Math.sin(f) - Math.sin(f0) * Math.cos(f) * Math.cos(l));
    return { x, y, visible: cosc > 0 };
  };
  const line = (pts: LatLng[]) => {
    let d = '';
    let pen = false;
    for (const p of pts) {
      const q = project(p);
      if (q.visible) {
        d += `${pen ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)} `;
        pen = true;
      } else pen = false;
    }
    return d;
  };
  const graticule: string[] = [];
  for (let lng = -180; lng < 180; lng += 30) graticule.push(line(Array.from({ length: 37 }, (_, i) => ({ lat: -90 + i * 5, lng }))));
  for (let lat = -60; lat <= 60; lat += 30) graticule.push(line(Array.from({ length: 73 }, (_, i) => ({ lat, lng: -180 + i * 5 }))));

  // land suggestion: dots for all catalogue cities give a sense of continents
  const cityDots = CITIES.map((c) => ({ c, q: project(c) })).filter((x) => x.q.visible);

  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="ocean" cx="35%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#3B82F6" />
          <Stop offset="0.6" stopColor="#1E3A8A" />
          <Stop offset="1" stopColor="#0B1340" />
        </RadialGradient>
        <RadialGradient id="atmo" cx="50%" cy="50%" r="50%">
          <Stop offset="0.85" stopColor="#22D3EE" stopOpacity="0" />
          <Stop offset="1" stopColor="#22D3EE" stopOpacity="0.45" />
        </RadialGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={r + 4} fill="url(#atmo)" />
      <Circle cx={cx} cy={cy} r={r} fill="url(#ocean)" />
      {graticule.map((d, i) => (
        <Path key={i} d={d} stroke="#9CC3FF" strokeOpacity={0.18} strokeWidth={0.8} fill="none" />
      ))}
      {cityDots.map(({ c, q }) => (
        <Circle
          key={c.id}
          cx={q.x}
          cy={q.y}
          r={highlightCountry && c.country === highlightCountry ? 5 : 2.2}
          fill={highlightCountry && c.country === highlightCountry ? colors.yellow : '#7DD3FC'}
          fillOpacity={0.8}
        />
      ))}
      {markers.map((m, i) => {
        const q = project(m);
        if (!q.visible) return null;
        return (
          <G key={i}>
            <Circle cx={q.x} cy={q.y} r={11} fill={(m.color ?? colors.pink) + '55'} />
            <Circle cx={q.x} cy={q.y} r={6} fill={m.color ?? colors.pink} stroke="#fff" strokeWidth={2} />
            {!!m.label && (
              <SvgText x={q.x} y={q.y - 14} fill="#fff" fontSize={10} fontWeight="700" textAnchor="middle">
                {m.label}
              </SvgText>
            )}
          </G>
        );
      })}
    </Svg>
  );
}
