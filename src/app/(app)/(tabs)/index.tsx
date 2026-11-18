import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import { LocationChip } from '@/components/LocationChip';
import { Appear, IconBadge, PressScale, SkeletonCard, Wiggle } from '@/components/motion';
import { PostCard } from '@/components/PostCard';
import { StoryRow } from '@/components/StoryRow';
import { TravellingBadge } from '@/components/Travelling';
import { Avatar, Card, Empty, Field, QuickAction, Row, Screen, SectionTitle } from '@/components/ui';
import { useMe } from '@/lib/session';
import { formatDurationShort, activeDurationMs } from '@/logic/journey';
import { subscribeMyJourneys } from '@/services/journeys';
import { loadFeed } from '@/services/social';
import { loadLiveStories, type LiveStory } from '@/services/travelStories';
import { colors, onDark, radius, shadows, type } from '@/theme';
import type { Journey, Post } from '@/types';

export default function Home() {
  const me = useMe();
  const [feed, setFeed] = useState<Post[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [stories, setStories] = useState<LiveStory[]>([]);

  const load = useCallback(async () => {
    try {
      setFeed(await loadFeed(me.uid));
    } catch {
      setFeed([]);
    }
    loadLiveStories(me.uid).then(setStories).catch(() => setStories([]));
  }, [me.uid]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => subscribeMyJourneys(me.uid, setJourneys), [me.uid]);

  const current = journeys.find((j) => j.status !== 'completed');
  const first = me.displayName.split(' ')[0];

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.brand} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
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
        <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="My profile" testID="open-profile">
          <Avatar name={me.displayName} uri={me.photoURL} size={42} ring />
        </Pressable>
      </Row>

      <LocationChip onPress={() => router.push('/live-map')} />

      <Pressable onPress={() => router.push('/explore')}>
        <View pointerEvents="none">
          <Field icon="search" placeholder="Search places, travellers, experiences…" editable={false} />
        </View>
      </Pressable>

      <SectionTitle title="Live now" action={stories.length ? `${stories.length} on the road` : undefined} />
      <StoryRow stories={stories} hasActiveJourney={!!current} />

      <Appear delay={80}>
      <Row gap={8} style={{ marginTop: 18 }}>
        <QuickAction testID="qa-start" icon="navigate" gradient="violet" label={current ? 'Add to Trip' : 'Start Journey'} colors={['#FE4A16', '#E11D74']} onPress={() => router.push(current ? `/capture?journeyId=${current.id}` : '/journey/start')} />
        <QuickAction testID="qa-plan" icon="sparkles" gradient="ocean" label="Plan Trip" colors={['#3B82F6', '#6157A9']} onPress={() => router.push('/planner')} />
        <QuickAction testID="qa-crew" icon="people" gradient="sunset" label="Join Crew" colors={['#FF6F3C', '#E11D74']} onPress={() => router.push('/crew')} />
        <QuickAction testID="qa-live-map" icon="map" gradient="mint" label="Live Map" colors={['#22C55E', '#0EA5E9']} onPress={() => router.push('/live-map')} />
      </Row>
      </Appear>

      <SectionTitle title={current ? 'My Current Journey' : 'Your journeys'} action={journeys.length ? 'See all' : undefined} onAction={() => router.push('/journeys')} />
      {current ? (
        <PressScale onPress={() => router.push(`/journey/${current.id}`)} testID="current-journey" scaleTo={0.97}>
          <LinearGradient colors={['#1B1838', '#3F3774', '#E11D74']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: radius.lg, padding: 18, overflow: 'hidden' }, shadows.lift]}>
            {current.coverUrl && <Image source={{ uri: current.coverUrl }} style={{ position: 'absolute', inset: 0, opacity: 0.35 } as never} contentFit="cover" />}
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={onDark.h2} numberOfLines={1}>
                {current.cities[0] ?? current.title}
              </Text>
              <TravellingBadge paused={current.status === 'paused'} testID="home-trip-status" />
            </Row>
            <Text style={[onDark.small, { marginTop: 4 }]}>
              {current.title} · {formatDurationShort(activeDurationMs(current))}
            </Text>
            <Row gap={16} style={{ marginTop: 14 }}>
              <Row gap={4}><Ionicons name="location" size={14} color="#fff" /><Text style={onDark.small}>{current.placesCount} Places</Text></Row>
              <Row gap={4}><Ionicons name="images" size={14} color="#fff" /><Text style={onDark.small}>{current.photos + current.videos} Memories</Text></Row>
              <Row gap={4}><Ionicons name="navigate" size={14} color="#fff" /><Text style={onDark.small}>{current.distanceKm.toFixed(1)} km</Text></Row>
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

      <SectionTitle title="Travel Feed" action="Explore" onAction={() => router.push('/explore')} />
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
