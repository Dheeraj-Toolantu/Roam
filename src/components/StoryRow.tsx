import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { LiveStory } from '../services/travelStories';
import { colors, gradients } from '../theme';
import { PressScale } from './motion';
import { Avatar } from './ui';

const SIZE = 64;

/**
 * WhatsApp-status style row of travellers who are on a journey right now.
 * Tapping a ring opens the full-screen story viewer at that traveller.
 */
export function StoryRow({ stories, hasActiveJourney }: { stories: LiveStory[]; hasActiveJourney: boolean }) {
  const ids = stories.map((s) => s.journey.id).join(',');
  const open = (i: number) => router.push({ pathname: '/stories', params: { ids, start: String(i) } });
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} testID="live-stories">
      {!hasActiveJourney && (
        <PressScale onPress={() => router.push('/journey/start')} accessibilityRole="button" accessibilityLabel="Start a live journey" style={styles.item} testID="story-add">
          <View style={[styles.ring, { backgroundColor: colors.cardAlt, borderWidth: 1.5, borderColor: colors.cardBorder, borderStyle: 'dashed' }]}>
            <View style={styles.addInner}>
              <Ionicons name="navigate" size={22} color={colors.brand} />
            </View>
            <View style={styles.plus}>
              <Ionicons name="add" size={14} color="#fff" />
            </View>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            Go live
          </Text>
        </PressScale>
      )}
      {stories.map((s, i) => {
        const city = s.journey.cities[s.journey.cities.length - 1];
        return (
          <PressScale
            key={s.journey.id}
            onPress={() => open(i)}
            accessibilityRole="button"
            accessibilityLabel={`${s.mine ? 'Your' : `${s.journey.ownerName}'s`} live journey${city ? ` in ${city}` : ''}`}
            style={styles.item}
            testID={`story-${s.journey.id}`}>
            <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ring}>
              <View style={styles.gap}>
                <Avatar name={s.journey.ownerName} uri={s.ownerPhoto ?? s.journey.coverUrl} size={SIZE - 8} />
              </View>
            </LinearGradient>
            <View style={[styles.live, s.journey.status === 'paused' && { backgroundColor: colors.yellow }]}>
              <Text style={styles.liveText}>{s.journey.status === 'paused' ? 'PAUSED' : 'LIVE'}</Text>
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {s.mine ? 'Your trip' : s.journey.ownerName.split(' ')[0]}
            </Text>
            {!!city && (
              <Text style={styles.city} numberOfLines={1}>
                {city}
              </Text>
            )}
          </PressScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 14, paddingVertical: 4, paddingRight: 8 },
  item: { width: SIZE + 8, alignItems: 'center' },
  ring: { width: SIZE + 4, height: SIZE + 4, borderRadius: (SIZE + 4) / 2, alignItems: 'center', justifyContent: 'center' },
  gap: { padding: 2, borderRadius: SIZE, backgroundColor: '#fff' },
  addInner: { width: SIZE - 8, height: SIZE - 8, borderRadius: SIZE, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  plus: { position: 'absolute', right: 0, bottom: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  live: { marginTop: -10, backgroundColor: colors.green, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
  liveText: { color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  name: { marginTop: 4, color: colors.text, fontSize: 12, fontWeight: '700', maxWidth: SIZE + 8 },
  city: { color: colors.textDim, fontSize: 10, fontWeight: '600', maxWidth: SIZE + 8 },
});
