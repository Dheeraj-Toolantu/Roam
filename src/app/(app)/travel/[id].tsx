import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GoogleMap } from '@/components/GoogleMap';
import { Appear } from '@/components/motion';
import { Avatar, Button, Empty, Header, Loading, Row, Screen, type IconName } from '@/components/ui';
import { VideoPlayer } from '@/components/VideoPlayer';
import { useMe } from '@/lib/session';
import { activeDurationMs, formatDurationShort, formatKm } from '@/logic/journey';
import { subscribeJourney } from '@/services/journeys';
import { loadJourneyMoments, myCrewIds, type Moment } from '@/services/travelStories';
import { getProfile, isFollowing } from '@/services/users';
import { colors, gradients, onDark, radius, shadows, space, type } from '@/theme';
import type { Journey } from '@/types';

const META: Record<Moment['kind'], { icon: IconName; color: string; label: string }> = {
  start: { icon: 'flag', color: colors.green, label: 'Start' },
  end: { icon: 'checkmark-done', color: colors.brand, label: 'Finish' },
  photo: { icon: 'camera', color: colors.orange, label: 'Photo' },
  video: { icon: 'videocam', color: colors.pink, label: 'Video' },
  place: { icon: 'location', color: colors.purple, label: 'Place' },
  review: { icon: 'star', color: colors.yellow, label: 'Review' },
  note: { icon: 'create', color: colors.blue, label: 'Note' },
};

const day = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const time = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

/** A finished (or live) journey told start-to-finish, one step at a time. Opened from a travel-feed story post. */
export default function TravelStoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const [j, setJ] = useState<Journey | null | undefined>(undefined);
  const [moments, setMoments] = useState<Moment[] | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => subscribeJourney(id, setJ), [id]);
  const ownerId = j?.ownerId;
  const status = j?.status;
  const activities = j?.activitiesCount;
  useEffect(() => {
    if (!j) return;
    let alive = true;
    (async () => {
      const follows = j.ownerId === me.uid ? true : await isFollowing(me.uid, j.ownerId).catch(() => false);
      const list = await loadJourneyMoments(j, me.uid, follows, !!j.groupId && (await myCrewIds(me.uid)).includes(j.groupId)).catch((): Moment[] => []);
      if (alive) setMoments(list);
    })();
    return () => {
      alive = false;
    };
    // Reload when the journey's content changes, not on every live GPS tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ownerId, status, activities, me.uid]);
  useEffect(() => {
    if (ownerId) getProfile(ownerId).then((p) => setPhoto(p?.photoURL ?? null)).catch(() => {});
  }, [ownerId]);

  if (j === undefined) return <Screen><Loading /></Screen>;
  if (j === null)
    return (
      <Screen>
        <Header title="Travel story" />
        <Empty icon="lock-closed-outline" title="Journey not available" text="It may have been deleted or is private." />
      </Screen>
    );

  const live = j.status !== 'completed';
  const stats = [
    { icon: 'navigate' as const, v: formatKm(j.distanceKm), l: 'Distance' },
    { icon: 'time' as const, v: formatDurationShort(activeDurationMs(j)), l: 'Duration' },
    { icon: 'business' as const, v: String(j.cities.length), l: j.cities.length === 1 ? 'City' : 'Cities' },
    { icon: 'images' as const, v: String(j.photos + j.videos), l: 'Memories' },
  ];
  const pins = (moments ?? []).length;

  return (
    <Screen>
      <Header title="Travel story" subtitle={live ? 'Live journey' : `${day(j.startedAt)}${j.endedAt ? ` – ${day(j.endedAt)}` : ''}`} />

      {/* Hero */}
      <View style={[styles.hero, shadows.lift]}>
        {j.coverUrl ? (
          <Image source={{ uri: j.coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient colors={['transparent', '#110F26E6']} locations={[0.25, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.heroTag}>
          <Ionicons name={live ? 'radio' : 'book'} size={12} color="#fff" />
          <Text style={styles.heroTagText}>{live ? 'LIVE NOW' : 'TRAVEL STORY'}</Text>
        </View>
        <View style={{ padding: space.lg }}>
          <Text style={onDark.h1} numberOfLines={2}>
            {j.title}
          </Text>
          {!!j.cities.length && (
            <Text style={[onDark.small, { marginTop: 4, fontWeight: '700' }]} numberOfLines={2}>
              {j.cities.join('  →  ')}
            </Text>
          )}
          <Pressable onPress={() => router.push(`/user/${j.ownerId}`)} style={{ marginTop: 12 }}>
            <Row gap={8}>
              <Avatar name={j.ownerName} uri={photo} size={28} />
              <Text style={[onDark.small, { fontWeight: '800', color: '#fff' }]}>{j.ownerId === me.uid ? 'You' : j.ownerName}</Text>
              {j.type === 'group' && <Text style={onDark.tiny}>· crew trip</Text>}
            </Row>
          </Pressable>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.stats}>
        {stats.map((s) => (
          <View key={s.l} style={styles.stat}>
            <View style={styles.statIcon}>
              <Ionicons name={s.icon} size={16} color={colors.brand} />
            </View>
            <Text style={styles.statV}>{s.v}</Text>
            <Text style={type.tiny}>{s.l}</Text>
          </View>
        ))}
      </View>

      {j.route.length > 1 && (
        <View style={[styles.mapCard, shadows.soft]}>
          <GoogleMap testID="travel-map" route={j.route} height={200} />
        </View>
      )}

      <Row style={{ justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.md }}>
        <Text style={type.h2}>The journey, step by step</Text>
        {moments && <Text style={type.small}>{pins} steps</Text>}
      </Row>

      {moments === null ? (
        <Loading />
      ) : (
        <View testID="journey-sequence">
          {moments.map((m, i) => (
            <Appear key={m.id} index={i}>
              <Step m={m} n={i + 1} first={i === 0} last={i === moments.length - 1} newDay={i === 0 || day(moments[i - 1].at) !== day(m.at)} />
            </Appear>
          ))}
          {live && (
            <View style={styles.liveEnd}>
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.textDim} />
              <Text style={type.small}>Journey still in progress — more stops coming.</Text>
            </View>
          )}
        </View>
      )}

      {j.ownerId === me.uid && (
        <View style={{ gap: 10, marginTop: space.lg }}>
          {!live && <Button title="Create ROAM Magic Video" icon="sparkles" onPress={() => router.push(`/magic?journeyId=${j.id}`)} />}
          <Button title="Manage journey" icon="settings-outline" variant="secondary" onPress={() => router.push(`/journey/${j.id}`)} />
        </View>
      )}
    </Screen>
  );
}

function Step({ m, n, first, last, newDay }: { m: Moment; n: number; first: boolean; last: boolean; newDay: boolean }) {
  const meta = META[m.kind];
  const where = [m.placeName && m.placeName !== m.title ? m.placeName : null, m.city].filter(Boolean).join(', ');
  return (
    <View>
      {newDay && (
        <View style={styles.dayRow}>
          <Text style={styles.dayText}>{day(m.at)}</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 12 }} testID={`step-${n}`}>
        <View style={{ alignItems: 'center', width: 34 }}>
          <View style={[styles.lineSeg, { opacity: first ? 0 : 1 }]} />
          <View style={[styles.num, { backgroundColor: meta.color }]}>
            <Text style={styles.numText}>{n}</Text>
          </View>
          <View style={[styles.lineSeg, { flex: 1, opacity: last ? 0 : 1 }]} />
        </View>
        <View style={[styles.stepCard, shadows.soft]}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={6}>
              <Ionicons name={meta.icon} size={14} color={meta.color} />
              <Text style={[styles.kind, { color: meta.color }]}>{meta.label.toUpperCase()}</Text>
            </Row>
            <Text style={type.tiny}>{time(m.at)}</Text>
          </Row>
          <Text style={[type.h3, { marginTop: 6 }]}>{m.title}</Text>
          {!!where && (
            <Row gap={4} style={{ marginTop: 2 }}>
              <Ionicons name="location-outline" size={12} color={colors.textDim} />
              <Text style={type.tiny}>{where}</Text>
            </Row>
          )}
          {m.rating != null && (
            <Row gap={2} style={{ marginTop: 6 }}>
              {[1, 2, 3, 4, 5].map((k) => (
                <Ionicons key={k} name={k <= (m.rating ?? 0) ? 'star' : 'star-outline'} size={14} color={colors.yellow} />
              ))}
            </Row>
          )}
          {!!m.mediaUrl && m.mediaType === 'image' && <Image source={{ uri: m.mediaUrl }} style={styles.media} contentFit="cover" transition={200} />}
          {!!m.mediaUrl && m.mediaType === 'video' && <VideoPlayer uri={m.mediaUrl} poster={m.thumbUrl} style={[styles.media, { aspectRatio: 9 / 16, maxHeight: 420 }]} testID={`step-video-${n}`} />}
          {!!m.caption && <Text style={[type.body, { marginTop: 8, lineHeight: 21, color: colors.ink700 }]}>{m.caption}</Text>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 260, borderRadius: radius.xl, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: colors.ink },
  heroTag: { position: 'absolute', top: 14, left: 14, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.brand, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  heroTagText: { color: '#fff', fontWeight: '900', fontSize: 10, letterSpacing: 1 },
  stats: { flexDirection: 'row', gap: 8, marginTop: space.md },
  stat: { flex: 1, backgroundColor: '#fff', borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardBorder, paddingVertical: 12, alignItems: 'center', gap: 2, ...shadows.soft },
  statIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statV: { color: colors.text, fontWeight: '800', fontSize: 15 },
  mapCard: { marginTop: space.md, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: '#fff' },
  dayRow: { marginLeft: 46, marginBottom: 8, marginTop: 4 },
  dayText: { alignSelf: 'flex-start', backgroundColor: colors.ink, color: '#fff', fontWeight: '800', fontSize: 11, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  lineSeg: { width: 2, height: 14, backgroundColor: colors.cardBorder },
  num: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff', ...shadows.soft },
  numText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  stepCard: { flex: 1, backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: space.md, marginBottom: space.md },
  kind: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  media: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, marginTop: 10, backgroundColor: colors.cardAlt },
  liveEnd: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 46, paddingVertical: 8 },
});
