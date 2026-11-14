import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import { LocationChip } from '@/components/LocationChip';
import { Appear, IconBadge, LiveDot, PressScale, SkeletonCard, Wiggle } from '@/components/motion';
import { PostCard } from '@/components/PostCard';
import { Avatar, Card, Empty, Field, IconButton, QuickAction, Row, Screen, SectionTitle } from '@/components/ui';
import { useMe } from '@/lib/session';
import { formatDurationShort, activeDurationMs } from '@/logic/journey';
import { subscribeMyJourneys } from '@/services/journeys';
import { subscribeNotifications } from '@/services/notifications';
import { loadFeed } from '@/services/social';
import { colors, radius, type } from '@/theme';
import type { Journey, Post } from '@/types';

export default function Home() {
  const me = useMe();
  const [feed, setFeed] = useState<Post[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      setFeed(await loadFeed(me.uid));
    } catch {
      setFeed([]);
    }
  }, [me.uid]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => subscribeMyJourneys(me.uid, setJourneys), [me.uid]);
  useEffect(
    () => subscribeNotifications(me.uid, (n) => setUnread(n.filter((x) => !x.read && me.notificationPrefs?.[x.type] !== false).length)),
    [me.uid, me.notificationPrefs],
  );

  const current = journeys.find((j) => j.status !== 'completed');
  const first = me.displayName.split(' ')[0];

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.cyan} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <View style={{ flex: 1 }}>
          <Row gap={6}>
            <Text style={type.h1}>Hi {first}</Text>
            <Wiggle>
              <Text style={{ fontSize: 26 }}>👋</Text>
            </Wiggle>
          </Row>
          <Text style={type.small}>Where to next?</Text>
        </View>
        <IconButton icon="notifications-outline" badge={unread} onPress={() => router.push('/notifications')} accessibilityLabel="Notifications" />
        <Pressable onPress={() => router.push('/profile')} style={{ marginLeft: 10 }} accessibilityRole="button" accessibilityLabel="My profile" testID="open-profile">
          <Avatar name={me.displayName} uri={me.photoURL} size={42} ring />
        </Pressable>
      </Row>

      <LocationChip onPress={() => router.push('/live-map')} />

      <Pressable onPress={() => router.push('/explore')}>
        <View pointerEvents="none">
          <Field icon="search" placeholder="Search places, travellers, experiences…" editable={false} />
        </View>
      </Pressable>

      <Appear delay={80}>
      <Row gap={8}>
        <QuickAction testID="qa-start" icon="navigate" gradient="violet" label="Start Journey" colors={['#8B5CF6', '#6366F1']} onPress={() => router.push(current ? `/journey/${current.id}` : '/journey/start')} />
        <QuickAction testID="qa-plan" icon="sparkles" gradient="ocean" label="Plan Trip" colors={['#22D3EE', '#3B82F6']} onPress={() => router.push('/planner')} />
        <QuickAction testID="qa-crew" icon="people" gradient="sunset" label="Join Crew" colors={['#F97316', '#EC4899']} onPress={() => router.push('/crew')} />
        <QuickAction testID="qa-live-map" icon="map" gradient="mint" label="Live Map" colors={['#22C55E', '#0EA5E9']} onPress={() => router.push('/live-map')} />
      </Row>
      </Appear>

      <SectionTitle title={current ? 'My Current Journey' : 'Your journeys'} action={journeys.length ? 'See all' : undefined} onAction={() => router.push('/journeys')} />
      {current ? (
        <PressScale onPress={() => router.push(`/journey/${current.id}`)} testID="current-journey" scaleTo={0.97}>
          <LinearGradient colors={['#2B1A6B', '#5B21B6', '#BE185D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.lg, padding: 18, overflow: 'hidden' }}>
            {current.coverUrl && <Image source={{ uri: current.coverUrl }} style={{ position: 'absolute', inset: 0, opacity: 0.35 } as never} contentFit="cover" />}
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={type.h2} numberOfLines={1}>
                {current.cities[0] ?? current.title}
              </Text>
              <Row gap={6} style={{ backgroundColor: '#00000040', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
                {current.status === 'paused' ? <Ionicons name="pause" size={11} color={colors.yellow} /> : <LiveDot />}
                <Text style={{ color: current.status === 'paused' ? colors.yellow : colors.green, fontWeight: '800', fontSize: 12 }}>
                  {current.status === 'paused' ? 'Paused' : 'Recording'}
                </Text>
              </Row>
            </Row>
            <Text style={[type.small, { color: '#E9D5FF', marginTop: 4 }]}>
              {current.title} · {formatDurationShort(activeDurationMs(current))}
            </Text>
            <Row gap={16} style={{ marginTop: 14 }}>
              <Row gap={4}><Ionicons name="location" size={14} color="#fff" /><Text style={type.small}>{current.placesCount} Places</Text></Row>
              <Row gap={4}><Ionicons name="images" size={14} color="#fff" /><Text style={type.small}>{current.photos + current.videos} Memories</Text></Row>
              <Row gap={4}><Ionicons name="navigate" size={14} color="#fff" /><Text style={type.small}>{current.distanceKm.toFixed(1)} km</Text></Row>
            </Row>
          </LinearGradient>
        </PressScale>
      ) : (
        <Card onPress={() => router.push('/journey/start')} testID="start-journey-card">
          <Row gap={14}>
            <IconBadge icon="navigate" gradient="ocean" size={52} rounded="circle" float />
            <View style={{ flex: 1 }}>
              <Text style={type.h3}>Start a journey</Text>
              <Text style={type.small}>ROAM tracks places, photos and moments and turns them into a cinematic story.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Row>
        </Card>
      )}

      <SectionTitle title="Travel Feed ✨" action="Explore" onAction={() => router.push('/explore')} />
      {feed === null ? (
        <>
          <SkeletonCard />
          <SkeletonCard media={false} />
        </>
      ) : feed.length === 0 ? (
        <Empty
          icon="images-outline"
          title="Your feed is quiet"
          text="Follow travellers in Explore or share your first moment with the + button."
        />
      ) : (
        feed.map((p, i) => (
          <Appear key={p.id} index={i}>
            <PostCard post={p} me={me} />
          </Appear>
        ))
      )}
    </Screen>
  );
}
