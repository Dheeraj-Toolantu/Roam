import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Globe, RouteMap } from '@/components/maps';
import { PostCard } from '@/components/PostCard';
import { Chip, Empty, ErrorText, Field, Header, InfoText, Loading, Row, Screen, SectionTitle, Segmented } from '@/components/ui';
import { CITIES, CITY_BY_ID } from '@/data/cities';
import { useMe } from '@/lib/session';
import { loadPublicPosts } from '@/services/social';
import { errorMessage } from '@/services/util';
import { colors, space, type } from '@/theme';
import type { Post } from '@/types';

type Cat = 'all' | 'photos' | 'videos' | 'reviews' | 'stories';
const CATS: { id: Cat; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'photos', label: 'Photos' },
  { id: 'videos', label: 'Videos' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'stories', label: 'Stories' },
];

function matches(p: Post, c: Cat) {
  if (c === 'all') return true;
  if (c === 'photos') return p.mediaType === 'image';
  if (c === 'videos') return p.mediaType === 'video' || p.kind === 'video';
  if (c === 'reviews') return p.kind === 'review' || p.rating != null;
  return p.kind === 'story' || (!p.mediaUrl && p.kind === 'moment');
}

/** City Memory Map (BRD 10.2) – aggregated per city, never precise (BR-014). */
export default function MemoryMapScreen() {
  const me = useMe();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<Cat>('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'globe' | 'map'>('globe');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    loadPublicPosts(200)
      .then(setPosts)
      .catch((e) => {
        setPosts([]);
        setError(errorMessage(e));
      });
  }, []);

  const filtered = useMemo(() => (posts ?? []).filter((p) => p.cityId && matches(p, cat)), [posts, cat]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    filtered.forEach((p) => (m[p.cityId!] = (m[p.cityId!] ?? 0) + 1));
    return m;
  }, [filtered]);

  const q = search.trim().toLowerCase();
  const cities = CITIES.filter((c) => !q || c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q))
    .map((c) => ({ c, n: counts[c.id] ?? 0 }))
    .sort((a, b) => b.n - a.n || a.c.name.localeCompare(b.c.name));
  const withMemories = cities.filter((x) => x.n > 0);
  const pins = withMemories.map(({ c, n }) => ({
    lat: c.lat,
    lng: c.lng,
    label: `${c.name} · ${n}`,
    color: colors.pink,
    size: Math.min(12, 5 + n),
  }));
  const sel = selected ? CITY_BY_ID[selected] : null;

  return (
    <Screen>
      <Header title="City Memory Map" subtitle="Real experiences from travellers" />
      <Field icon="search" placeholder="Search cities" value={search} onChangeText={setSearch} testID="memory-search" />
      <Row style={{ flexWrap: 'wrap', marginBottom: space.md }}>
        {CATS.map((c) => (
          <Chip key={c.id} label={c.label} active={cat === c.id} onPress={() => setCat(c.id)} testID={`memory-cat-${c.id}`} />
        ))}
      </Row>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { id: 'globe', label: 'Globe' },
          { id: 'map', label: 'Map' },
        ]}
      />
      <ErrorText text={error} />
      {posts === null ? (
        <Loading />
      ) : (
        <>
          <View style={{ alignItems: 'center', marginTop: space.lg }}>
            {view === 'globe' ? (
              <Globe size={280} markers={pins} rotate={!sel} focus={sel ? { lat: sel.lat, lng: sel.lng } : null} />
            ) : (
              <RouteMap route={[]} pins={pins.length ? pins : [{ lat: 20, lng: 78, label: 'No memories yet', color: colors.textDim }]} height={260} style={{ width: '100%' }} />
            )}
          </View>
          <InfoText icon="shield-checkmark" text="Pins are placed at the city centre. Exact locations of travellers are never shown." />

          <SectionTitle title={sel ? `Memories in ${sel.name}` : 'Cities'} action={sel ? 'All cities' : undefined} onAction={() => setSelected(null)} />
          {sel ? (
            <>
              {filtered.filter((p) => p.cityId === sel.id).length === 0 ? (
                <Empty icon="images-outline" title="No memories in this category" />
              ) : (
                filtered.filter((p) => p.cityId === sel.id).map((p) => <PostCard key={p.id} post={p} me={me} />)
              )}
              <Pressable onPress={() => router.push(`/city/${sel.id}`)} style={{ marginTop: space.md }}>
                <Text style={{ color: colors.cyan, fontWeight: '700', textAlign: 'center' }}>Open {sel.name} City Hub →</Text>
              </Pressable>
            </>
          ) : (
            cities.slice(0, q ? 30 : 20).map(({ c, n }) => (
              <Pressable
                key={c.id}
                onPress={() => (n ? setSelected(c.id) : router.push(`/city/${c.id}`))}
                testID={`memory-city-${c.id}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.cardBorder }}>
                <Text style={{ fontSize: 22 }}>{c.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={type.h3}>{c.name}</Text>
                  <Text style={type.tiny}>{c.country}</Text>
                </View>
                <Row gap={4}>
                  <Ionicons name="images" size={14} color={n ? colors.pink : colors.textDim} />
                  <Text style={{ color: n ? '#fff' : colors.textDim, fontWeight: '700' }}>{n}</Text>
                </Row>
              </Pressable>
            ))
          )}
        </>
      )}
    </Screen>
  );
}
