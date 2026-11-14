import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Globe } from '@/components/maps';
import { toast } from '@/components/PostCard';
import { Appear, Confetti, Pop, tap } from '@/components/motion';
import { Avatar, Button, Card, Empty, ErrorText, Header, ProgressBar, Row, Screen, SectionTitle, Stat } from '@/components/ui';
import { CITIES } from '@/data/cities';
import { computeAchievements, passportStats, type Achievement } from '@/logic/achievements';
import { formatKm } from '@/logic/journey';
import { useMe } from '@/lib/session';
import { subscribeMyJourneys } from '@/services/journeys';
import { createPost } from '@/services/social';
import { errorMessage } from '@/services/util';
import { colors, radius, space, type } from '@/theme';
import type { Journey } from '@/types';

const FLAGS: Record<string, string> = {
  IN: '🇮🇳', AE: '🇦🇪', ID: '🇮🇩', JP: '🇯🇵', SG: '🇸🇬', TH: '🇹🇭', NP: '🇳🇵', FR: '🇫🇷', GB: '🇬🇧', IT: '🇮🇹', GR: '🇬🇷',
  ES: '🇪🇸', TR: '🇹🇷', EG: '🇪🇬', ZA: '🇿🇦', US: '🇺🇸', MX: '🇲🇽', BR: '🇧🇷', PE: '🇵🇪', AU: '🇦🇺', NZ: '🇳🇿',
};

export default function PassportScreen() {
  const me = useMe();
  const [journeys, setJourneys] = useState<Journey[] | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeMyJourneys(me.uid, setJourneys), [me.uid]);

  const list = useMemo(() => journeys ?? [], [journeys]);
  const stats = useMemo(() => passportStats(list), [list]);
  const achievements = useMemo(() => computeAchievements(list, me.homeCountry || 'India'), [list, me.homeCountry]);
  const distance = list.reduce((s, j) => s + (j.distanceKm || 0), 0);
  const places = list.reduce((s, j) => s + (j.placesCount || 0), 0);
  const memories = list.reduce((s, j) => s + (j.photos || 0) + (j.videos || 0), 0);
  const visitedCityIds = Array.from(new Set(list.flatMap((j) => j.cityIds ?? [])));
  const markers = visitedCityIds
    .map((id) => CITIES.find((c) => c.id === id))
    .filter((c): c is (typeof CITIES)[number] => !!c)
    .map((c) => ({ lat: c.lat, lng: c.lng, label: c.name, color: colors.yellow }));
  const countryCodes = Object.fromEntries(CITIES.map((c) => [c.country, c.countryCode]));
  const unlocked = achievements.filter((a) => a.unlocked).length;

  const [celebrate, setCelebrate] = useState(0);
  const share = async (a: Achievement) => {
    setSharing(a.id);
    setError(null);
    try {
      await createPost(me, {
        text: `🏆 Achievement unlocked: ${a.title} — ${a.description}`,
        visibility: me.defaultPostVisibility ?? 'followers',
        kind: 'achievement',
      });
      setCelebrate((n) => n + 1);
      tap('success');
      toast(`Shared “${a.title}” to your profile.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSharing(null);
    }
  };

  return (
    <Screen>
      <Header title="Travel Passport" subtitle="Profile & achievements" />
      <LinearGradient colors={['#312E81', '#6D28D9', '#0E7490']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cover}>
        <Row style={{ gap: space.lg }}>
          <Avatar name={me.displayName} uri={me.photoURL} size={64} ring />
          <View style={{ flex: 1 }}>
            <Text style={type.tiny}>ROAM PASSPORT</Text>
            <Text style={type.h2}>{me.displayName}</Text>
            <Text style={{ color: '#ffffffcc' }}>{stats.countries.length > 1 ? 'Global Traveller' : 'Explorer'}</Text>
          </View>
          <Ionicons name="airplane" size={28} color="#ffffffaa" />
        </Row>
      </LinearGradient>

      <Card style={{ marginTop: space.lg }}>
        <Row>
          <Stat value={stats.countries.length} label="Countries" />
          <Stat value={stats.cities.length} label="Cities" />
          <Stat value={places} label="Places" />
        </Row>
        <Row style={{ marginTop: space.lg }}>
          <Stat value={formatKm(distance)} label="Distance" />
          <Stat value={stats.journeys} label="Journeys" />
          <Stat value={memories} label="Memories" />
        </Row>
      </Card>

      <SectionTitle title="Travel Globe" />
      <Card style={{ alignItems: 'center' }}>
        <Globe size={260} markers={markers} />
        {markers.length === 0 && <Text style={[type.small, { marginTop: space.sm }]}>Start a journey to pin your first city.</Text>}
      </Card>

      <SectionTitle title="Countries" />
      {stats.countries.length === 0 ? (
        <Empty icon="flag-outline" title="No countries yet" text="Countries are stamped automatically when your journey visits them." />
      ) : (
        <Row style={{ flexWrap: 'wrap' }}>
          {stats.countries.map((c) => (
            <View key={c} style={styles.stamp}>
              <Text style={{ fontSize: 20 }}>{FLAGS[countryCodes[c]] ?? '🌍'}</Text>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{c}</Text>
            </View>
          ))}
        </Row>
      )}

      <SectionTitle title={`Achievements · ${unlocked}/${achievements.length}`} />
      <ErrorText text={error} />
      {achievements.map((a, i) => (
        <Appear key={a.id} index={i}>
        <Card style={[{ marginBottom: space.sm }, !a.unlocked && { opacity: 0.6 }]} testID={`passport-achievement-${a.id}`}>
          <Row style={{ gap: space.md }}>
            <Pop delay={150 + i * 70}>
              <LinearGradient colors={a.unlocked ? a.colors : ['#334155', '#1E293B']} style={[styles.badge, a.unlocked && { shadowColor: a.colors[0], shadowOpacity: 0.7, shadowRadius: 14, elevation: 6 }]}>
                <Ionicons name={(a.unlocked ? a.icon : 'lock-closed') as never} size={22} color="#fff" />
              </LinearGradient>
            </Pop>
            <View style={{ flex: 1 }}>
              <Text style={type.h3}>{a.title}</Text>
              <Text style={type.tiny}>{a.description}</Text>
              <View style={{ marginTop: 6 }}>
                <ProgressBar pct={a.progress * 100} color={a.unlocked ? colors.green : colors.cyan} height={6} />
              </View>
              <Text style={[type.tiny, { marginTop: 4 }]}>{a.unlocked ? 'Unlocked' : a.progressLabel}</Text>
            </View>
            {a.unlocked && (
              <Button title="Share" small variant="secondary" icon="share-social" loading={sharing === a.id} onPress={() => share(a)} testID={`share-achievement-${a.id}`} />
            )}
          </Row>
        </Card>
        </Appear>
      ))}
      <Confetti fire={celebrate} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cover: { borderRadius: radius.xl, padding: space.xl, borderWidth: 1, borderColor: colors.cardBorder },
  stamp: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.cardBorder },
  badge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
