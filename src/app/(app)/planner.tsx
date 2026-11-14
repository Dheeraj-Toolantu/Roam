import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button, Card, Chip, Header, InfoText, Row, Screen, SectionTitle, type IconName } from '@/components/ui';
import { CITIES, CITY_BY_ID } from '@/data/cities';
import { planTrip } from '@/logic/planner';
import { colors, radius, space, type } from '@/theme';

type Style = 'relaxed' | 'culture' | 'adventure' | 'food';
const STYLES: { id: Style; label: string; icon: IconName }[] = [
  { id: 'relaxed', label: 'Relaxed', icon: 'sunny' },
  { id: 'culture', label: 'Culture', icon: 'library' },
  { id: 'adventure', label: 'Adventure', icon: 'bicycle' },
  { id: 'food', label: 'Food', icon: 'restaurant' },
];
const KIND_ICON: Record<string, IconName> = {
  attraction: 'camera', restaurant: 'restaurant', beach: 'umbrella', nature: 'leaf', culture: 'library', nightlife: 'wine',
};

export default function PlannerScreen() {
  const params = useLocalSearchParams<{ city?: string }>();
  const [cityId, setCityId] = useState(params.city && CITY_BY_ID[params.city] ? params.city : 'goa');
  const [days, setDays] = useState(3);
  const [style, setStyle] = useState<Style>('relaxed');
  const city = CITY_BY_ID[cityId];
  const plan = useMemo(() => planTrip(city, days, style), [city, days, style]);

  return (
    <Screen>
      <Header title="Smart Trip Planner" subtitle="beta – rule-based; AI assistant coming in a later phase" />
      <SectionTitle title="Destination" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {CITIES.map((c) => (
          <Chip key={c.id} label={`${c.emoji} ${c.name}`} active={c.id === cityId} onPress={() => setCityId(c.id)} testID={`planner-city-${c.id}`} />
        ))}
      </ScrollView>

      <SectionTitle title="Days" />
      <Row style={{ flexWrap: 'wrap' }}>
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <Chip key={d} label={`${d}`} active={d === days} onPress={() => setDays(d)} testID={`planner-days-${d}`} />
        ))}
      </Row>

      <SectionTitle title="Travel style" />
      <Row style={{ flexWrap: 'wrap' }}>
        {STYLES.map((s) => (
          <Chip key={s.id} label={s.label} icon={s.icon} active={s.id === style} onPress={() => setStyle(s.id)} testID={`planner-style-${s.id}`} />
        ))}
      </Row>

      <LinearGradient colors={city.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.lg, padding: space.lg, marginTop: space.xl }}>
        <Text style={{ fontSize: 32 }}>{city.emoji}</Text>
        <Text style={type.h2}>
          {days} {days === 1 ? 'day' : 'days'} in {city.name}
        </Text>
        <Text style={{ color: '#ffffffdd' }}>{city.tagline}</Text>
      </LinearGradient>

      {plan.map((d) => (
        <Card key={d.day} style={{ marginTop: space.md }} testID={`plan-day-${d.day}`}>
          <Text style={[type.h3, { marginBottom: space.sm }]}>
            Day {d.day} · <Text style={{ color: colors.cyan }}>{d.title}</Text>
          </Text>
          {d.items.map((it, i) => (
            <Row key={i} style={{ paddingVertical: 8 }}>
              <Text style={[type.tiny, { width: 70 }]}>{it.time}</Text>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={KIND_ICON[it.kind] ?? 'location'} size={14} color={colors.cyan} />
              </View>
              <Text style={[type.body, { flex: 1 }]}>{it.name}</Text>
            </Row>
          ))}
        </Card>
      ))}

      <Button
        title="Create crew trip"
        icon="people"
        style={{ marginTop: space.xl }}
        onPress={() => router.push(`/trip/create?destination=${encodeURIComponent(city.name)}`)}
        testID="planner-create-trip"
      />
      <View style={{ marginTop: space.md }}>
        <InfoText text="Itineraries are generated from curated destination highlights. Personalised AI recommendations are planned for Phase 5." />
      </View>
    </Screen>
  );
}
