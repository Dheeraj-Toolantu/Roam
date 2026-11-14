import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import { PostCard } from '@/components/PostCard';
import { Avatar, Card, Empty, Field, IconButton, Pill, QuickAction, Row, Screen, SectionTitle } from '@/components/ui';
import { useMe } from '@/lib/session';
import { formatDurationShort, activeDurationMs } from '@/logic/journey';
import { subscribeMyJourneys } from '@/services/journeys';
import { subscribeNotifications } from '@/services/notifications';
import { loadFeed } from '@/services/social';
import { colors, gradients, radius, type } from '@/theme';
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
          <Text style={type.h1}>Hi {first} 👋</Text>
          <Text style={type.small}>Where to next?</Text>
        </View>
        <IconButton icon="notifications-outline" badge={unread} onPress={() => router.push('/notifications')} accessibilityLabel="Notifications" />
        <Pressable onPress={() => router.push('/profile')} style={{ marginLeft: 10 }}>
          <Avatar name={me.displayName} uri={me.photoURL} size={42} ring />
        </Pressable>
      </Row>

      <Pressable onPress={() => router.push('/explore')}>
        <View pointerEvents="none">
          <Field icon="search" placeholder="Search places, travellers, experiences…" editable={false} />
        </View>
      </Pressable>

      <Row gap={8}>
        <QuickAction testID="qa-start" icon="play-circle-outline" label="Start Journey" colors={['#8B5CF6', '#6366F1']} onPress={() => router.push(current ? `/journey/${current.id}` : '/journey/start')} />
        <QuickAction testID="qa-plan" icon="calendar-outline" label="Plan Trip" colors={['#22D3EE', '#3B82F6']} onPress={() => router.push('/planner')} />
        <QuickAction testID="qa-crew" icon="people-outline" label="Join Crew" colors={['#F97316', '#EC4899']} onPress={() => router.push('/crew')} />
        <QuickAction testID="qa-split" icon="wallet-outline" label="ROAM Split" colors={['#F59E0B', '#EF4444']} onPress={() => router.push('/crew')} />
      </Row>

      <SectionTitle title={current ? 'My Current Journey' : 'Your journeys'} action={journeys.length ? 'See all' : undefined} onAction={() => router.push('/journeys')} />
      {current ? (
        <Pressable onPress={() => router.push(`/journey/${current.id}`)} testID="current-journey">
          <LinearGradient colors={['#2B1A6B', '#5B21B6', '#BE185D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.lg, padding: 18, overflow: 'hidden' }}>
            {current.coverUrl && <Image source={{ uri: current.coverUrl }} style={{ position: 'absolute', inset: 0, opacity: 0.35 } as never} contentFit="cover" />}
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={type.h2} numberOfLines={1}>
                {current.cities[0] ?? current.title}
              </Text>
              <Pill text={current.status === 'paused' ? 'Paused' : 'Recording'} color={current.status === 'paused' ? colors.yellow : colors.green} icon={current.status === 'paused' ? 'pause' : 'radio-button-on'} />
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
        </Pressable>
      ) : (
        <Card onPress={() => router.push('/journey/start')} testID="start-journey-card">
          <Row gap={14}>
            <LinearGradient colors={gradients.brand} style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="navigate" size={24} color="#fff" />
            </LinearGradient>
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
        <Text style={type.small}>Loading stories…</Text>
      ) : feed.length === 0 ? (
        <Empty
          icon="images-outline"
          title="Your feed is quiet"
          text="Follow travellers in Explore or share your first moment with the + button."
        />
      ) : (
        feed.map((p) => <PostCard key={p.id} post={p} me={me} />)
      )}
    </Screen>
  );
}
