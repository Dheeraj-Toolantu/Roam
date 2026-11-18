import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Appear } from '@/components/motion';
import { Button, Empty, Pill, Row, Screen, Segmented, Stat, Card } from '@/components/ui';
import { TravellingBadge } from '@/components/Travelling';
import { CITY_BY_ID } from '@/data/cities';
import { useMe } from '@/lib/session';
import { activeDurationMs, formatDurationShort, formatKm } from '@/logic/journey';
import { subscribeMyJourneys } from '@/services/journeys';
import { radius, type, onDark } from '@/theme';
import type { Journey } from '@/types';

export default function Journeys() {
  const me = useMe();
  const [list, setList] = useState<Journey[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'solo' | 'group'>('all');
  useEffect(() => subscribeMyJourneys(me.uid, setList), [me.uid]);

  const shown = (list ?? []).filter((j) => filter === 'all' || j.type === filter);
  const done = (list ?? []).filter((j) => j.status === 'completed');
  const totalKm = done.reduce((s, j) => s + j.distanceKm, 0);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <Text style={type.h1}>Journeys</Text>
        <Button small title="New" icon="add" onPress={() => router.push('/journey/start')} testID="new-journey" />
      </Row>
      <Card style={{ marginBottom: 14 }}>
        <Row>
          <Stat value={done.length} label="Completed" />
          <Stat value={new Set(done.flatMap((j) => j.cities)).size} label="Cities" />
          <Stat value={formatKm(totalKm)} label="Distance" />
          <Stat value={done.reduce((s, j) => s + j.photos + j.videos, 0)} label="Memories" />
        </Row>
      </Card>
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { id: 'all', label: 'All' },
          { id: 'solo', label: 'Solo' },
          { id: 'group', label: 'Group' },
        ]}
      />
      <View style={{ height: 14 }} />
      {list === null ? (
        <Text style={type.small}>Loading…</Text>
      ) : shown.length === 0 ? (
        <Empty
          icon="map-outline"
          title="No journeys yet"
          text="Start a journey and ROAM will record your route, places and memories automatically."
          action={<Button title="Start Journey" onPress={() => router.push('/journey/start')} style={{ marginTop: 10 }} />}
        />
      ) : (
        shown.map((j, i) => (
          <Appear key={j.id} index={i}>
            <JourneyCard j={j} />
          </Appear>
        ))
      )}
    </Screen>
  );
}

function JourneyCard({ j }: { j: Journey }) {
  const city = j.anchorCityId ? CITY_BY_ID[j.anchorCityId] : null;
  const grad: [string, string] = city?.colors ?? ['#1B1838', '#3F3774'];
  return (
    <Pressable onPress={() => router.push(`/journey/${j.id}`)} style={{ marginBottom: 12 }} testID="journey-card">
      <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.lg, overflow: 'hidden' }}>
        {j.coverUrl && <Image source={{ uri: j.coverUrl }} style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.4 }} contentFit="cover" />}
        <View style={{ padding: 16, backgroundColor: 'rgba(17,15,38,0.35)' }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={onDark.h2} numberOfLines={1}>
              {city?.emoji ?? '🧭'} {j.title}
            </Text>
            {j.status === 'completed' ? (
              <Pill text={j.type === 'group' ? 'Group' : 'Solo'} color="#fff" icon={j.type === 'group' ? 'people' : 'person'} />
            ) : (
              <TravellingBadge paused={j.status === 'paused'} />
            )}
          </Row>
          <Text style={[onDark.small, { color: '#F1F5F9', marginTop: 4 }]}>
            {new Date(j.startedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            {j.cities.length ? ` · ${j.cities.join(', ')}` : ''}
          </Text>
          <Row gap={16} style={{ marginTop: 12 }}>
            <Row gap={4}><Ionicons name="time-outline" size={14} color="#fff" /><Text style={onDark.small}>{formatDurationShort(activeDurationMs(j))}</Text></Row>
            <Row gap={4}><Ionicons name="navigate-outline" size={14} color="#fff" /><Text style={onDark.small}>{formatKm(j.distanceKm)}</Text></Row>
            <Row gap={4}><Ionicons name="images-outline" size={14} color="#fff" /><Text style={onDark.small}>{j.photos + j.videos}</Text></Row>
            <Row gap={4}><Ionicons name="location-outline" size={14} color="#fff" /><Text style={onDark.small}>{j.placesCount}</Text></Row>
          </Row>
        </View>
      </LinearGradient>
    </Pressable>
  );
}
