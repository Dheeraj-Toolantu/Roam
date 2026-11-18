import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { colors } from '../theme';

/**
 * "Trip in progress" indicator: a little car driving along a dashed road, looping.
 * Replaces the old "Recording" label so it's obvious at a glance the user is on the move.
 * Paused trips show a parked car with a pause badge instead.
 */
export function TravellingBadge({
  paused,
  tone = 'light',
  label,
  testID,
}: {
  paused?: boolean;
  /** 'light' = on dark/photo backgrounds, 'dark' = on white cards */
  tone?: 'light' | 'dark';
  label?: string;
  testID?: string;
}) {
  const ROAD = 34;
  const x = useSharedValue(0);
  const bob = useSharedValue(0);
  useEffect(() => {
    if (paused) {
      x.value = withTiming(ROAD / 2, { duration: 300 });
      bob.value = 0;
      return;
    }
    x.value = 0;
    x.value = withRepeat(withTiming(ROAD, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, false, undefined, ReduceMotion.System);
    bob.value = withRepeat(withSequence(withTiming(-1.5, { duration: 180 }), withTiming(0, { duration: 180 })), -1, false, undefined, ReduceMotion.System);
  }, [paused, x, bob]);
  const car = useAnimatedStyle(() => ({ transform: [{ translateX: x.value - 7 }, { translateY: bob.value }] }));

  const fg = tone === 'light' ? '#fff' : colors.text;
  const accent = paused ? colors.yellow : tone === 'light' ? '#86EFAC' : colors.green;
  return (
    <View
      style={[styles.pill, { backgroundColor: tone === 'light' ? '#ffffff26' : colors.brandSoft, borderColor: tone === 'light' ? '#ffffff33' : '#FFC9AA' }]}
      accessibilityLabel={paused ? 'Trip paused' : 'Trip in progress'}
      testID={testID}>
      <View style={{ width: ROAD, height: 16, justifyContent: 'center' }}>
        <View style={[styles.road, { borderColor: tone === 'light' ? '#ffffff88' : colors.textDim }]} />
        <Animated.View style={[{ position: 'absolute', top: -1 }, car]}>
          <Ionicons name="car-sport" size={14} color={paused ? accent : tone === 'light' ? '#fff' : colors.brand} />
        </Animated.View>
      </View>
      {paused && <Ionicons name="pause" size={10} color={accent} />}
      <Text style={[styles.text, { color: paused ? (tone === 'light' ? '#FDE68A' : '#B45309') : fg }]}>{label ?? (paused ? 'Paused' : 'Travelling')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, alignSelf: 'flex-start' },
  road: { position: 'absolute', left: 0, right: 0, bottom: 1, borderBottomWidth: 1.5, borderStyle: 'dashed' },
  text: { fontWeight: '800', fontSize: 12 },
});
