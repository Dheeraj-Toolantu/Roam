import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LiveDot } from '@/components/motion';
import { Avatar, goBackOr, type IconName } from '@/components/ui';
import { VideoPlayer } from '@/components/VideoPlayer';
import { useMe } from '@/lib/session';
import { activeDurationMs, formatDurationShort, formatKm } from '@/logic/journey';
import { getJourney } from '@/services/journeys';
import { loadJourneyMoments, myCrewIds, type Moment } from '@/services/travelStories';
import { getProfile, isFollowing } from '@/services/users';
import { timeAgo } from '@/services/util';
import { colors, gradients } from '@/theme';
import type { Journey } from '@/types';

const SLIDE_MS = 5000;
const VIDEO_MS = 9000;

const KIND_ICON: Record<Moment['kind'], IconName> = {
  start: 'flag',
  end: 'checkmark-done',
  photo: 'camera',
  video: 'videocam',
  place: 'location',
  review: 'star',
  note: 'create',
};

type Loaded = { journey: Journey; moments: Moment[]; photo: string | null };

/** Full-screen, WhatsApp-status style viewer for live journeys. Tap right/left to move, hold to pause. */
export default function StoriesScreen() {
  const { ids, start } = useLocalSearchParams<{ ids?: string; start?: string }>();
  const me = useMe();
  const list = useMemo(() => (ids ?? '').split(',').filter(Boolean), [ids]);
  const [who, setWho] = useState(() => Math.max(0, Math.min(Number(start ?? 0) || 0, list.length - 1)));
  const [slide, setSlide] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [cache, setCache] = useState<Record<string, Loaded | null>>({});
  const requested = useRef(new Set<string>());

  const jid = list[who];
  const cur = jid ? cache[jid] : undefined;

  // Load the current traveller (and pre-load the next one).
  useEffect(() => {
    for (const id of [list[who], list[who + 1]].filter(Boolean)) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      (async () => {
        const j = await getJourney(id).catch(() => null);
        if (!j) return { id, v: null };
        const follows = j.ownerId === me.uid ? true : await isFollowing(me.uid, j.ownerId).catch(() => false);
        const [moments, prof] = await Promise.all([loadJourneyMoments(j, me.uid, follows, !!j.groupId && (await myCrewIds(me.uid)).includes(j.groupId)).catch((): Moment[] => []), getProfile(j.ownerId).catch(() => null)]);
        return { id, v: { journey: j, moments, photo: prof?.photoURL ?? null } };
      })().then(({ id: k, v }) => setCache((c) => ({ ...c, [k]: v })));
    }
  }, [who, list, me.uid]);

  const close = useCallback(() => goBackOr('/'), []);

  const next = useCallback(() => {
    setProgress(0);
    if (cur && slide < cur.moments.length - 1) return setSlide((s) => s + 1);
    if (who < list.length - 1) {
      setWho((w) => w + 1);
      setSlide(0);
      return;
    }
    close();
  }, [cur, slide, who, list.length, close]);

  const prev = useCallback(() => {
    setProgress(0);
    if (slide > 0) return setSlide((s) => s - 1);
    if (who > 0) {
      setWho((w) => w - 1);
      setSlide(0);
    }
  }, [slide, who]);

  const moment = cur?.moments[slide];
  const duration = moment?.mediaType === 'video' ? VIDEO_MS : SLIDE_MS;

  // Auto-advance timer.
  useEffect(() => {
    if (!cur || paused) return;
    const step = 50;
    const iv = setInterval(() => setProgress((p) => Math.min(1, p + step / duration)), step);
    return () => clearInterval(iv);
  }, [cur, paused, duration, slide, who]);
  useEffect(() => {
    if (progress >= 1) next();
  }, [progress, next]);

  // Skip travellers whose journey is gone / no longer visible.
  useEffect(() => {
    if (jid && cache[jid] === null) next();
  }, [jid, cache, next]);

  useEffect(() => {
    if (!list.length) close();
  }, [list.length, close]);

  const j = cur?.journey;
  const live = j && j.status !== 'completed';
  const city = j ? (moment?.city ?? j.cities[j.cities.length - 1] ?? null) : null;

  return (
    <View style={styles.root} testID="story-viewer">
      {!cur || !moment ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : (
        <Slide j={cur.journey} m={moment} />
      )}

      {/* Tap zones: left = previous, right = next, hold anywhere = pause */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <Pressable style={{ flex: 1 }} onPress={prev} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} delayLongPress={180} accessibilityLabel="Previous" testID="story-prev" />
          <Pressable style={{ flex: 2 }} onPress={next} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} delayLongPress={180} accessibilityLabel="Next" testID="story-next" />
        </View>
      </View>

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <View style={styles.bars}>
          {(cur?.moments ?? [null]).map((_, i) => (
            <View key={i} style={styles.bar}>
              <View style={[styles.barFill, { width: `${i < slide ? 100 : i === slide ? progress * 100 : 0}%` }]} />
            </View>
          ))}
        </View>
        <View style={styles.head}>
          {j && <Avatar name={j.ownerName} uri={cur?.photo ?? null} size={36} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.owner} numberOfLines={1}>
              {j ? (j.ownerId === me.uid ? 'Your journey' : j.ownerName) : ' '}
            </Text>
            {j && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {live && j.status === 'active' && <LiveDot size={7} />}
                <Text style={styles.meta} numberOfLines={1}>
                  {live ? (j.status === 'paused' ? 'Paused' : 'Live') : 'Completed'}
                  {city ? ` · ${city}` : ''}
                  {moment ? ` · ${timeAgo(moment.at)}` : ''}
                </Text>
              </View>
            )}
          </View>
          {paused && <Ionicons name="pause" size={18} color="#fff" style={{ marginRight: 8 }} />}
          <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close stories" testID="story-close">
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </View>
      </SafeAreaView>

      {j && (
        <SafeAreaView edges={['bottom']} style={styles.bottom} pointerEvents="box-none">
          <Pressable
            onPress={() => router.replace(j.status === 'completed' ? `/travel/${j.id}` : j.ownerId === me.uid ? `/journey/${j.id}` : `/travel/${j.id}`)}
            style={styles.cta}
            accessibilityRole="button"
            testID="story-open-journey">
            <Ionicons name="map-outline" size={16} color={colors.text} />
            <Text style={styles.ctaText}>View full journey</Text>
            <Ionicons name="chevron-up" size={16} color={colors.text} />
          </Pressable>
        </SafeAreaView>
      )}
    </View>
  );
}

function Slide({ j, m }: { j: Journey; m: Moment }) {
  if (m.mediaUrl && m.mediaType === 'image') {
    return (
      <View style={StyleSheet.absoluteFill}>
        <Image source={{ uri: m.mediaUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        <LinearGradient colors={['#00000088', 'transparent', 'transparent', '#000000CC']} locations={[0, 0.25, 0.6, 1]} style={StyleSheet.absoluteFill} />
        <Caption m={m} />
      </View>
    );
  }
  if (m.mediaUrl && m.mediaType === 'video') {
    return (
      <View style={[StyleSheet.absoluteFill, { justifyContent: 'center' }]}>
        <VideoPlayer autoPlay uri={m.mediaUrl} poster={m.thumbUrl} style={{ width: '100%', aspectRatio: 9 / 16, maxHeight: '100%' }} testID="live-story-video" />
        <Caption m={m} />
      </View>
    );
  }
  if (m.kind === 'start' || m.kind === 'end') {
    const stats = [
      { icon: 'navigate' as const, v: formatKm(j.distanceKm), l: 'distance' },
      { icon: 'time' as const, v: formatDurationShort(activeDurationMs(j)), l: 'on the road' },
      { icon: 'location' as const, v: String(j.placesCount), l: 'places' },
      { icon: 'images' as const, v: String(j.photos + j.videos), l: 'memories' },
    ];
    return (
      <LinearGradient colors={m.kind === 'start' ? gradients.hero : gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.card]}>
        {j.coverUrl && <Image source={{ uri: j.coverUrl }} style={[StyleSheet.absoluteFill, { opacity: 0.25 }]} contentFit="cover" />}
        <View style={styles.kindBadge}>
          <Ionicons name={KIND_ICON[m.kind]} size={26} color="#fff" />
        </View>
        <Text style={styles.kicker}>{m.kind === 'start' ? (j.status === 'completed' ? 'JOURNEY' : 'ON A JOURNEY RIGHT NOW') : 'JOURNEY COMPLETED'}</Text>
        <Text style={styles.big}>{j.title}</Text>
        {!!j.cities.length && <Text style={styles.route}>{j.cities.join('  →  ')}</Text>}
        <View style={styles.stats}>
          {stats.map((s) => (
            <View key={s.l} style={styles.stat}>
              <Ionicons name={s.icon} size={16} color="#ffffffcc" />
              <Text style={styles.statV}>{s.v}</Text>
              <Text style={styles.statL}>{s.l}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>
    );
  }
  return (
    <LinearGradient colors={m.kind === 'note' ? gradients.purple : gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.card]}>
      <View style={styles.kindBadge}>
        <Ionicons name={KIND_ICON[m.kind]} size={26} color="#fff" />
      </View>
      <Text style={styles.kicker}>{m.kind === 'review' ? 'REVIEW' : m.kind === 'note' ? 'NOTE' : 'CHECKED IN'}</Text>
      <Text style={styles.big}>{m.title}</Text>
      {m.rating != null && (
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 10 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Ionicons key={i} name={i <= (m.rating ?? 0) ? 'star' : 'star-outline'} size={22} color="#FDE68A" />
          ))}
        </View>
      )}
      {!!m.caption && <Text style={styles.body}>{m.caption}</Text>}
      {!!m.city && (
        <Text style={styles.route}>
          <Ionicons name="location" size={14} color="#fff" /> {m.city}
        </Text>
      )}
    </LinearGradient>
  );
}

function Caption({ m }: { m: Moment }) {
  const where = [m.placeName, m.city].filter(Boolean).join(', ');
  if (!m.caption && !where) return null;
  return (
    <View style={styles.caption} pointerEvents="none">
      {!!where && (
        <View style={styles.place}>
          <Ionicons name="location" size={13} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{where}</Text>
        </View>
      )}
      {!!m.caption && <Text style={styles.capText}>{m.caption}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 10 },
  bars: { flexDirection: 'row', gap: 4, paddingTop: 8 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#ffffff55', overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: '#fff' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  owner: { color: '#fff', fontWeight: '800', fontSize: 15 },
  meta: { color: '#ffffffcc', fontSize: 12, fontWeight: '600' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingBottom: 14 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, marginBottom: 10 },
  ctaText: { color: colors.text, fontWeight: '800', fontSize: 14 },
  card: { padding: 28, justifyContent: 'center' },
  kindBadge: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#ffffff26', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  kicker: { color: '#ffffffb3', fontWeight: '800', fontSize: 12, letterSpacing: 1.6 },
  big: { color: '#fff', fontWeight: '900', fontSize: 32, letterSpacing: -0.5, marginTop: 6 },
  route: { color: '#ffffffe6', fontWeight: '700', fontSize: 15, marginTop: 12 },
  body: { color: '#ffffffee', fontSize: 17, lineHeight: 24, marginTop: 14 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 28 },
  stat: { width: '47%', backgroundColor: '#ffffff1f', borderRadius: 16, padding: 14, gap: 2 },
  statV: { color: '#fff', fontWeight: '900', fontSize: 22 },
  statL: { color: '#ffffffb3', fontSize: 12, fontWeight: '600' },
  caption: { position: 'absolute', left: 16, right: 16, bottom: 96, gap: 8 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: '#00000066', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  capText: { color: '#fff', fontSize: 16, lineHeight: 22, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 6 },
});
