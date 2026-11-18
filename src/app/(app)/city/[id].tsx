import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { GoogleMap } from '@/components/GoogleMap';
import { PostCard } from '@/components/PostCard';
import { Button, Card, Chip, Empty, ErrorText, Header, Loading, Row, Screen, SectionTitle, type IconName } from '@/components/ui';
import { CITY_BY_ID } from '@/data/cities';
import { useMe } from '@/lib/session';
import { loadCityPosts } from '@/services/social';
import { errorMessage } from '@/services/util';
import { colors, radius, space, type, onDark } from '@/theme';
import type { Post } from '@/types';

const KIND_ICON: Record<string, IconName> = {
  attraction: 'camera',
  restaurant: 'restaurant',
  beach: 'umbrella',
  nature: 'leaf',
  culture: 'library',
  nightlife: 'wine',
};

export default function CityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const city = CITY_BY_ID[id ?? ''];
  const [kind, setKind] = useState<string>('all');
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!city) return;
    loadCityPosts(city.id)
      .then(setPosts)
      .catch((e) => {
        setPosts([]);
        setError(errorMessage(e));
      });
  }, [city]);

  const kinds = useMemo(() => (city ? Array.from(new Set(city.highlights.map((h) => h.kind))) : []), [city]);

  if (!city) {
    return (
      <Screen>
        <Header title="Destination" />
        <Empty icon="help-circle-outline" title="Destination not found" />
      </Screen>
    );
  }

  const highlights = city.highlights.filter((h) => kind === 'all' || h.kind === kind);

  return (
    <Screen>
      <Header title={city.name} subtitle={city.country} />
      <LinearGradient colors={city.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.xl, padding: space.xl, minHeight: 180, justifyContent: 'flex-end' }}>
        <Text style={{ fontSize: 56 }}>{city.emoji}</Text>
        <Text style={[onDark.h1, { fontSize: 30 }]}>{city.name}</Text>
        <Text style={{ color: '#ffffffdd', fontSize: 15 }}>{city.tagline}</Text>
        <Row style={{ marginTop: 8 }}>
          <Ionicons name="flag" size={14} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 13 }}>
            {city.country} · {city.continent}
          </Text>
        </Row>
      </LinearGradient>

      <Row style={{ marginTop: space.lg, gap: space.sm }}>
        <Button title="Plan a trip" icon="sparkles" variant="purple" small style={{ flex: 1 }} onPress={() => router.push(`/planner?city=${city.id}`)} testID="city-plan" />
        <Button
          title="Start a crew trip"
          icon="people"
          small
          style={{ flex: 1 }}
          onPress={() => router.push(`/trip/create?destination=${encodeURIComponent(city.name)}`)}
          testID="city-crew"
        />
      </Row>

      <SectionTitle title="Highlights" />
      <Row style={{ flexWrap: 'wrap', marginBottom: space.md }}>
        <Chip label="All" active={kind === 'all'} onPress={() => setKind('all')} />
        {kinds.map((k) => (
          <Chip key={k} label={k[0].toUpperCase() + k.slice(1)} icon={KIND_ICON[k]} active={kind === k} onPress={() => setKind(k)} />
        ))}
      </Row>
      <Card style={{ paddingVertical: space.sm }}>
        {highlights.map((h, i) => (
          <Row key={h.name} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.cardBorder }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={KIND_ICON[h.kind] ?? 'location'} size={16} color={colors.cyan} />
            </View>
            <Text style={[type.body, { flex: 1 }]}>{h.name}</Text>
            <Text style={type.tiny}>{h.kind}</Text>
          </Row>
        ))}
      </Card>

      <SectionTitle title="On the map" />
      <GoogleMap testID="city-map" markers={[{ id: city.id, lat: city.lat, lng: city.lng, title: city.name, description: city.tagline, color: colors.pink }]} center={{ lat: city.lat, lng: city.lng }} zoom={11} height={200} />
      <Text style={[type.tiny, { marginTop: 6 }]}>Memories are shown at city level only to protect travellers’ privacy.</Text>

      <SectionTitle title="Public memories" />
      <ErrorText text={error} />
      {posts === null ? (
        <Loading />
      ) : posts.length === 0 ? (
        <Empty icon="images-outline" title={`No public memories in ${city.name} yet`} text="Be the first to share one on your next journey." />
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} me={me} />)
      )}
    </Screen>
  );
}
