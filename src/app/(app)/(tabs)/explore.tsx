import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Globe } from '@/components/maps';
import { PostCard } from '@/components/PostCard';
import { Appear, IconBadge, PressScale, type IconGradient } from '@/components/motion';
import {
  Avatar,
  Button,
  Card,
  Empty,
  ErrorText,
  Field,
  InfoText,
  Loading,
  Row,
  SectionTitle,
  Segmented,
  Screen,
  type IconName,
} from '@/components/ui';
import { CITIES, CITY_BY_ID, type City } from '@/data/cities';
import { useMe } from '@/lib/session';
import { getLiveWorld } from '@/services/journeys';
import { loadPublicPosts } from '@/services/social';
import { findByUsername, follow, getFollowingIds, listPublicTravellers, unfollow } from '@/services/users';
import { errorMessage } from '@/services/util';
import { colors, radius, space, type, onDark, shadows } from '@/theme';
import type { Post, UserProfile } from '@/types';

type Mode = 'explore' | 'live' | 'trending';
type Category = 'destinations' | 'travellers' | 'stories';

export default function ExploreScreen() {
  const me = useMe();
  const [mode, setMode] = useState<Mode>('explore');
  const [cat, setCat] = useState<Category>('destinations');
  const [search, setSearch] = useState('');
  const [travellers, setTravellers] = useState<UserProfile[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [live, setLive] = useState<{ total: number; byCity: { cityId: string; count: number }[] }>({ total: 0, byCity: [] });
  const [found, setFound] = useState<UserProfile | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [t, f, p, l] = await Promise.all([
        listPublicTravellers(30).catch(() => [] as UserProfile[]),
        getFollowingIds(me.uid).catch(() => [] as string[]),
        loadPublicPosts(100).catch(() => [] as Post[]),
        getLiveWorld().catch(() => ({ total: 0, byCity: [] })),
      ]);
      setTravellers(t.filter((u) => u.uid !== me.uid));
      setFollowing(f);
      setPosts(p);
      setLive(l);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [me.uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const q = search.trim().toLowerCase();
  const cityMatches = useMemo(
    () => (q ? CITIES.filter((c) => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q)) : []),
    [q],
  );

  const runUserSearch = async () => {
    if (!q) return;
    setFound(undefined);
    try {
      setFound(await findByUsername(q));
    } catch {
      setFound(null);
    }
  };

  const postCounts = useMemo(() => {
    const m: Record<string, number> = {};
    posts.forEach((p) => p.cityId && (m[p.cityId] = (m[p.cityId] ?? 0) + 1));
    return m;
  }, [posts]);
  const liveCounts = useMemo(() => Object.fromEntries(live.byCity.map((b) => [b.cityId, b.count])), [live]);

  const trending = useMemo(
    () =>
      [...CITIES]
        .map((c) => ({ c, score: (postCounts[c.id] ?? 0) * 2 + (liveCounts[c.id] ?? 0) * 3 }))
        .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name)),
    [postCounts, liveCounts],
  );

  const toggleFollow = async (u: UserProfile) => {
    const isF = following.includes(u.uid);
    setFollowing((f) => (isF ? f.filter((x) => x !== u.uid) : [...f, u.uid]));
    try {
      if (isF) await unfollow(me.uid, u.uid);
      else await follow(me, u.uid);
    } catch (e) {
      setFollowing((f) => (isF ? [...f, u.uid] : f.filter((x) => x !== u.uid)));
      setError(errorMessage(e));
    }
  };

  return (
    <Screen>
      <Row style={{ marginBottom: space.lg }}>
        <Ionicons name="compass" size={28} color={colors.cyan} />
        <Text style={[type.h1, { flex: 1 }]}>Explore</Text>
        <Pressable onPress={() => router.push('/planner')} accessibilityLabel="Smart Trip Planner" testID="open-planner" style={styles.plannerBtn}>
          <Ionicons name="sparkles" size={16} color={colors.yellow} />
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>Planner</Text>
        </Pressable>
      </Row>

      <Field
        icon="search"
        placeholder="Search destinations or @username"
        value={search}
        onChangeText={(t) => {
          setSearch(t);
          setFound(undefined);
        }}
        onSubmitEditing={runUserSearch}
        returnKeyType="search"
        autoCapitalize="none"
        testID="explore-search"
      />

      {!!q && (
        <Card style={{ marginBottom: space.lg }}>
          <Text style={[type.small, { marginBottom: 8 }]}>Destinations</Text>
          {cityMatches.length === 0 && <Text style={type.tiny}>No destinations match “{search}”.</Text>}
          {cityMatches.slice(0, 6).map((c) => (
            <Pressable key={c.id} onPress={() => router.push(`/city/${c.id}`)} style={styles.searchRow} testID={`search-city-${c.id}`}>
              <Text style={{ fontSize: 22 }}>{c.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={type.h3}>{c.name}</Text>
                <Text style={type.tiny}>{c.country}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
            </Pressable>
          ))}
          <Text style={[type.small, { marginTop: 12, marginBottom: 8 }]}>Travellers</Text>
          {found === undefined ? (
            <Pressable onPress={runUserSearch} testID="search-user">
              <Text style={{ color: colors.cyan, fontWeight: '700' }}>Search for @{q.replace(/^@/, '')}</Text>
            </Pressable>
          ) : found === null ? (
            <Text style={type.tiny}>No traveller with that username (or their profile is private).</Text>
          ) : (
            <TravellerRow u={found} following={following.includes(found.uid)} isMe={found.uid === me.uid} onToggle={() => toggleFollow(found)} />
          )}
        </Card>
      )}

      <Segmented<Mode>
        value={mode}
        onChange={setMode}
        options={[
          { id: 'explore', label: 'Explore' },
          { id: 'live', label: 'Live World' },
          { id: 'trending', label: 'Trending' },
        ]}
      />
      <ErrorText text={error} />

      {loading ? (
        <Loading />
      ) : mode === 'explore' ? (
        <>
          <Row style={{ marginTop: space.lg, gap: space.sm }}>
            <CategoryTile icon="business" label="Destinations" active={cat === 'destinations'} onPress={() => setCat('destinations')} />
            <CategoryTile icon="people" label="Travellers" active={cat === 'travellers'} onPress={() => setCat('travellers')} />
            <CategoryTile icon="map" label="City Hub" onPress={() => router.push('/memory-map')} />
            <CategoryTile icon="images" label="Stories" active={cat === 'stories'} onPress={() => setCat('stories')} />
          </Row>

          <SectionTitle title="Trending Destinations 🔥" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
            {trending.slice(0, 10).map(({ c }, i) => (
              <Appear key={c.id} index={i}>
                <CityCard city={c} live={liveCounts[c.id]} />
              </Appear>
            ))}
          </ScrollView>

          <SectionTitle title="City Memory Map" />
          <Pressable onPress={() => router.push('/memory-map')} testID="memory-map-card">
            <LinearGradient colors={['#1B1838', '#3F3774']} style={styles.memoryCard}>
              <Ionicons name="location" size={34} color={colors.pink} />
              <Text style={[onDark.h3, { marginTop: 6 }]}>Explore real experiences</Text>
              <Text style={onDark.small}>Public memories from travellers around the world — city-level, never precise.</Text>
            </LinearGradient>
          </Pressable>

          {cat === 'destinations' && (
            <>
              <SectionTitle title="All destinations" />
              <View style={styles.grid}>
                {CITIES.map((c) => (
                  <Pressable key={c.id} onPress={() => router.push(`/city/${c.id}`)} style={styles.gridItem}>
                    <LinearGradient colors={c.colors} style={styles.gridCard}>
                      <Text style={{ fontSize: 24 }}>{c.emoji}</Text>
                      <Text style={{ color: '#fff', fontWeight: '800' }} numberOfLines={1}>
                        {c.name}
                      </Text>
                      <Text style={{ color: '#ffffffcc', fontSize: 11 }} numberOfLines={1}>
                        {c.country}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {cat === 'travellers' && (
            <>
              <SectionTitle title="Travellers to follow" />
              {travellers.length === 0 ? (
                <Empty icon="people-outline" title="No public travellers yet" text="Invite friends to ROAM to grow your travel network." />
              ) : (
                travellers.map((u) => (
                  <TravellerRow key={u.uid} u={u} following={following.includes(u.uid)} onToggle={() => toggleFollow(u)} />
                ))
              )}
            </>
          )}

          {cat === 'stories' && (
            <>
              <SectionTitle title="Public travel stories" />
              {posts.length === 0 ? (
                <Empty icon="images-outline" title="No public stories yet" text="Share a moment publicly to appear here." />
              ) : (
                posts.slice(0, 20).map((p) => <PostCard key={p.id} post={p} me={me} />)
              )}
            </>
          )}
        </>
      ) : mode === 'live' ? (
        <View style={{ alignItems: 'center', marginTop: space.lg }}>
          <Globe
            size={280}
            markers={live.byCity
              .map((b) => CITY_BY_ID[b.cityId])
              .filter(Boolean)
              .map((c) => ({ lat: c.lat, lng: c.lng, label: c.name, color: colors.pink }))}
          />
          <Card style={{ width: '100%', marginTop: space.lg }}>
            <Row>
              <Ionicons name="people" size={24} color={colors.cyan} />
              <View>
                <Text style={type.h1} testID="live-total">
                  {live.total.toLocaleString('en-IN')}
                </Text>
                <Text style={type.small}>Travellers Exploring Now</Text>
              </View>
            </Row>
          </Card>
          <View style={{ width: '100%', marginTop: space.md }}>
            {live.byCity.length === 0 ? (
              <Empty icon="earth-outline" title="Quiet right now" text="No travellers are sharing their city at the moment." />
            ) : (
              live.byCity.map((b) => {
                const c = CITY_BY_ID[b.cityId];
                if (!c) return null;
                return (
                  <Pressable key={b.cityId} onPress={() => router.push(`/city/${c.id}`)} style={styles.searchRow}>
                    <Text style={{ fontSize: 22 }}>{c.emoji}</Text>
                    <Text style={[type.h3, { flex: 1 }]}>{c.name}</Text>
                    <Text style={{ color: colors.orange, fontWeight: '800' }}>🔥 {b.count}</Text>
                  </Pressable>
                );
              })
            )}
          </View>
          <View style={{ width: '100%' }}>
            <InfoText icon="shield-checkmark" text="Live World is opt-in and city-level only. Precise locations are never shared." />
          </View>
        </View>
      ) : (
        <View style={{ marginTop: space.lg }}>
          {trending.slice(0, 15).map(({ c }, i) => (
            <Pressable key={c.id} onPress={() => router.push(`/city/${c.id}`)} style={styles.searchRow} testID={`trending-${c.id}`}>
              <Text style={[type.h3, { width: 26, color: i < 3 ? colors.yellow : colors.textMuted }]}>{i + 1}</Text>
              <Text style={{ fontSize: 22 }}>{c.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={type.h3}>{c.name}</Text>
                <Text style={type.tiny}>
                  {postCounts[c.id] ?? 0} memories · {liveCounts[c.id] ?? 0} exploring now
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
            </Pressable>
          ))}
          <Button title="Plan a trip with Smart Planner" icon="sparkles" variant="purple" onPress={() => router.push('/planner')} style={{ marginTop: space.lg }} />
        </View>
      )}
    </Screen>
  );
}

function CategoryTile({ icon, label, active, onPress }: { icon: IconName; label: string; active?: boolean; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} style={[styles.tile, active && { borderColor: '#FFC9AA', backgroundColor: colors.brandSoft }]} accessibilityLabel={label} scaleTo={0.92}>
      <IconBadge icon={icon} gradient={TILE_GRADIENT[icon as string] ?? 'violet'} size={38} />
      <Text style={{ color: colors.text, fontSize: 11, fontWeight: '800' }}>{label}</Text>
    </PressScale>
  );
}

function CityCard({ city, live }: { city: City; live?: number }) {
  return (
    <Pressable onPress={() => router.push(`/city/${city.id}`)} testID={`city-card-${city.id}`}>
      <LinearGradient colors={city.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cityCard}>
        <Text style={{ fontSize: 40 }}>{city.emoji}</Text>
        <View>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{city.name}</Text>
          <Text style={{ color: '#ffffffcc', fontSize: 11 }}>{live ? `🔥 ${live} exploring` : city.tagline}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function TravellerRow({ u, following, onToggle, isMe }: { u: UserProfile; following: boolean; onToggle: () => void; isMe?: boolean }) {
  return (
    <Pressable onPress={() => router.push(`/user/${u.uid}`)} style={styles.searchRow} testID={`traveller-${u.uid}`}>
      <Avatar name={u.displayName} uri={u.photoURL} size={42} />
      <View style={{ flex: 1 }}>
        <Text style={type.h3}>{u.displayName}</Text>
        <Text style={type.tiny}>
          @{u.username}
          {u.homeCity ? ` · ${u.homeCity}` : ''}
        </Text>
      </View>
      {!isMe && (
        <Button title={following ? 'Following' : 'Follow'} small variant={following ? 'secondary' : 'primary'} onPress={onToggle} testID="follow-button" />
      )}
    </Pressable>
  );
}

const TILE_GRADIENT: Record<string, IconGradient> = {'business': 'ocean', 'people': 'sunset', 'map': 'mint', 'images': 'candy', 'book': 'violet', 'create': 'sky', 'notifications': 'gold', 'shield': 'fire'};

const styles = StyleSheet.create({
  plannerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.cardBorder },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  tile: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, ...shadows.soft },
  cityCard: { width: 130, height: 160, borderRadius: radius.lg, padding: space.md, justifyContent: 'space-between' },
  memoryCard: { borderRadius: radius.lg, padding: space.lg, minHeight: 130, justifyContent: 'center', borderWidth: 1, borderColor: colors.cardBorder },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  gridItem: { width: '31.5%' },
  gridCard: { borderRadius: radius.md, padding: 10, height: 96, justifyContent: 'space-between' },
});
