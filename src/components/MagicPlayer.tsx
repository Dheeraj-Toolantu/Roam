import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { City } from '../data/cities';
import { previewMusic, stopPreviewMusic } from '../lib/musicPlayer';
import type { TrackId } from '../logic/musicScore';
import { colors, gradients, radius, type } from '../theme';
import { Globe, RouteMap } from './maps';
import { Logo, Row } from './ui';

export type Template = 'cinematic' | 'reel' | 'documentary';

export const TEMPLATES: { id: Template; label: string; sub: string; durations: number[] }[] = [
  { id: 'cinematic', label: 'Cinematic', sub: '1 min', durations: [6, 6, 6, 10, 20, 8, 4] },
  { id: 'reel', label: 'Reel', sub: '30 sec', durations: [3, 3, 3, 6, 9, 4, 2] },
  { id: 'documentary', label: 'Documentary', sub: '2–5 min', durations: [10, 10, 12, 20, 60, 12, 6] },
];

export const SCENES = ['Earth Introduction', 'Country Zoom', 'City Zoom', 'Journey Route', 'Memories', 'Journey Summary', 'Closing'];

export interface MagicMemory {
  url: string | null;
  isVideo: boolean;
  place: string | null;
  time: number;
  author?: string;
  caption?: string;
}

export interface MagicData {
  title: string;
  subtitle: string; // "Dheeraj" or "5 Friends"
  city: City | null;
  country: string | null;
  route: { lat: number; lng: number }[];
  places: { lat: number; lng: number; label?: string }[];
  memories: MagicMemory[];
  stats: { label: string; value: string }[];
}

/**
 * Renders the 7 ROAM MAGIC scenes (BRD §8) in real time from journey data.
 * Pure UI: deterministic for a given (data, template, t).
 */
export function MagicPlayer({ data, template, autoPlay = true, music = 'none' }: { data: MagicData; template: Template; autoPlay?: boolean; music?: TrackId }) {
  const durations = TEMPLATES.find((t) => t.id === template)!.durations;
  const total = durations.reduce((a, b) => a + b, 0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);

  useEffect(() => setT(0), [template]);
  // Soundtrack follows play/pause (web; silent on native for now)
  const tRef = useRef(0);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  useEffect(() => {
    if (playing) previewMusic(music, tRef.current, total);
    else stopPreviewMusic();
    return () => stopPreviewMusic();
  }, [playing, music, total]);
  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => {
      setT((x) => {
        if (x + 0.1 >= total) {
          setPlaying(false);
          return total;
        }
        return x + 0.1;
      });
    }, 100);
    return () => clearInterval(iv);
  }, [playing, total]);

  const { scene, p } = useMemo(() => {
    let acc = 0;
    for (let i = 0; i < durations.length; i++) {
      if (t < acc + durations[i] || i === durations.length - 1) return { scene: i, p: Math.min(1, (t - acc) / durations[i]) };
      acc += durations[i];
    }
    return { scene: 0, p: 0 };
  }, [t, durations]);

  const fade = Math.min(1, p * 4, (1 - p) * 6 + 0.2);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <View>
      <View style={{ aspectRatio: 4 / 5, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' }} testID="magic-stage">
        <View style={{ flex: 1, opacity: fade }}>{renderScene(scene, p, data)}</View>
        <View style={{ position: 'absolute', top: 12, left: 12 }}>
          <Text style={{ color: '#ffffffaa', fontSize: 11, fontWeight: '700' }} testID="magic-scene">
            {scene + 1}/7 · {SCENES[scene]}
          </Text>
        </View>
        <View style={{ position: 'absolute', bottom: 10, right: 12 }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{mmss(t)} / {mmss(total)}</Text>
        </View>
      </View>
      {/* scrubber with scene ticks */}
      <View style={{ flexDirection: 'row', gap: 3, marginTop: 10 }}>
        {durations.map((d, i) => {
          const start = durations.slice(0, i).reduce((a, b) => a + b, 0);
          const fill = Math.max(0, Math.min(1, (t - start) / d));
          return (
            <Pressable key={i} onPress={() => setT(start)} style={{ flex: d, height: 6, borderRadius: 3, backgroundColor: colors.cardAlt, overflow: 'hidden' }} accessibilityLabel={`Jump to ${SCENES[i]}`}>
              <View style={{ width: `${fill * 100}%`, height: 6, backgroundColor: colors.cyan }} />
            </Pressable>
          );
        })}
      </View>
      <Row style={{ justifyContent: 'center', marginTop: 12 }} gap={18}>
        <Pressable onPress={() => { setT(0); setPlaying(true); }} accessibilityLabel="Replay">
          <Ionicons name="refresh" size={26} color={colors.textMuted} />
        </Pressable>
        <Pressable
          onPress={() => {
            if (t >= total) setT(0);
            setPlaying(!playing);
          }}
          accessibilityLabel={playing ? 'Pause video' : 'Play video'}
          testID="magic-play">
          <LinearGradient colors={gradients.primary} style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={playing ? 'pause' : 'play'} size={26} color="#fff" />
          </LinearGradient>
        </Pressable>
        <Pressable onPress={() => setT(Math.min(total, durations.slice(0, scene + 1).reduce((a, b) => a + b, 0)))} accessibilityLabel="Next scene">
          <Ionicons name="play-skip-forward" size={26} color={colors.textMuted} />
        </Pressable>
      </Row>
    </View>
  );
}

function renderScene(scene: number, p: number, d: MagicData) {
  const city = d.city;
  switch (scene) {
    case 0:
      return (
        <LinearGradient colors={['#000005', '#0B1340', '#000005']} style={center}>
          <Globe size={250} rotate markers={city ? [{ lat: city.lat, lng: city.lng, color: colors.yellow }] : []} />
          <Text style={[big, { marginTop: 18 }]}>Every journey has a story</Text>
        </LinearGradient>
      );
    case 1:
      return (
        <LinearGradient colors={['#020617', '#0F172A']} style={center}>
          <View style={{ transform: [{ scale: 1 + p * 0.5 }] }}>
            <Globe size={230} rotate={false} focus={city} highlightCountry={d.country} markers={city ? [{ lat: city.lat, lng: city.lng, color: colors.yellow }] : []} />
          </View>
          <Text style={[big, { fontSize: 34, marginTop: 24 }]}>{d.country ?? 'Somewhere new'}</Text>
        </LinearGradient>
      );
    case 2:
      return (
        <LinearGradient colors={city ? [city.colors[0], city.colors[1], '#020617'] : gradients.sunset} style={center}>
          <Text style={{ fontSize: 72 + p * 20 }}>{city?.emoji ?? '🧭'}</Text>
          <Text style={[big, { fontSize: 40 }]}>{city?.name ?? d.title}</Text>
          <Text style={[type.body, { opacity: 0.9, marginTop: 8 }]}>{city?.tagline}</Text>
          <View style={{ marginTop: 22, backgroundColor: '#00000055', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>✈️ {d.subtitle}</Text>
          </View>
        </LinearGradient>
      );
    case 3:
      return (
        <View style={{ flex: 1, backgroundColor: '#0A0F2C', padding: 14, justifyContent: 'center' }}>
          <Text style={[big, { fontSize: 22, marginBottom: 12 }]}>The Route</Text>
          <RouteMap
            route={d.route.length > 1 ? d.route : d.places.length > 1 ? d.places : city ? [city, { lat: city.lat + 0.02, lng: city.lng + 0.03 }] : []}
            pins={d.places.slice(0, Math.ceil(d.places.length * p)).map((x) => ({ ...x, color: colors.pink, size: 6 }))}
            progress={p}
            height={300}
          />
        </View>
      );
    case 4: {
      const mem: MagicMemory[] = d.memories.length ? d.memories : d.places.map((x) => ({ url: null, isVideo: false, place: x.label ?? null, time: 0 }));
      if (!mem.length) {
        return (
          <LinearGradient colors={gradients.sunset} style={center}>
            <Text style={big}>Moments to remember</Text>
          </LinearGradient>
        );
      }
      const idx = Math.min(mem.length - 1, Math.floor(p * mem.length));
      const local = p * mem.length - idx;
      const m = mem[idx];
      return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {m.url && !m.isVideo ? (
            <Image source={{ uri: m.url }} style={{ flex: 1, transform: [{ scale: 1.05 + local * 0.12 }] }} contentFit="cover" />
          ) : (
            <LinearGradient colors={idx % 2 ? gradients.brand : gradients.sunset} style={center}>
              <Ionicons name={m.isVideo ? 'videocam' : 'location'} size={64} color="#fff" />
            </LinearGradient>
          )}
          <LinearGradient colors={['transparent', '#000000DD']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, paddingTop: 60 }}>
            {!!m.place && <Text style={[big, { textAlign: 'left', fontSize: 24 }]}>📍 {m.place}</Text>}
            {!!m.caption && <Text style={{ color: '#fff', opacity: 0.9, marginTop: 4 }}>{m.caption}</Text>}
            <Text style={{ color: '#ffffffaa', marginTop: 4, fontSize: 12 }}>
              {m.time ? new Date(m.time).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
              {m.author ? ` · by ${m.author}` : ''}
            </Text>
          </LinearGradient>
        </View>
      );
    }
    case 5:
      return (
        <LinearGradient colors={['#1E1B4B', '#4C1D95', '#831843']} style={center}>
          <Text style={[big, { marginBottom: 20 }]}>{d.title}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, paddingHorizontal: 16 }}>
            {d.stats.map((s, i) => (
              <View key={s.label} style={{ width: 120, padding: 12, borderRadius: 16, backgroundColor: '#ffffff18', alignItems: 'center', opacity: Math.min(1, p * 6 - i * 0.6) }}>
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>{s.value}</Text>
                <Text style={{ color: '#E9D5FF', fontSize: 12 }}>{s.label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>
      );
    default:
      return (
        <LinearGradient colors={['#2A1B6B', '#5B2A86', '#C2410C']} style={center}>
          <Logo size={80} />
          <Text style={[big, { fontSize: 36, marginTop: 14 }]}>ROAM</Text>
          <Text style={{ color: '#fff', marginTop: 8, fontSize: 16, fontWeight: '700' }}>{d.title}</Text>
          <Text style={{ color: '#ffffffaa', marginTop: 20 }}>Every Journey Has a Story.</Text>
        </LinearGradient>
      );
  }
}

const center = { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 16 };
const big = { color: '#fff', fontSize: 28, fontWeight: '900' as const, textAlign: 'center' as const };
