import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { colors } from '../theme';
import { PulseRing } from './motion';
import { Logo, Wordmark } from './ui';

export function Splash() {
  const bob = useSharedValue(0);
  const bar = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withSequence(withTiming(-8, { duration: 1100, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.quad) })), -1, false, undefined, ReduceMotion.System);
    bar.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.cubic) }), -1, false, undefined, ReduceMotion.System);
  }, [bob, bar]);
  const logo = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  const progress = useAnimatedStyle(() => ({ transform: [{ translateX: -60 + 120 * bar.value }] }));
  return (
    <LinearGradient colors={['#1B1050', '#5B2A86', '#C2410C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View entering={FadeIn.duration(500)} style={[{ alignItems: 'center' }, logo]}>
        <PulseRing color="#22D3EE" size={130}>
          <Logo size={92} />
        </PulseRing>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(200).springify()} style={{ alignItems: 'center', marginTop: 18 }}>
        <Wordmark size={44} />
        <Text style={{ color: '#fff', opacity: 0.9, fontSize: 18, textAlign: 'center', marginTop: 14, lineHeight: 26, fontWeight: '600' }}>
          Explore Together ✈️{'\n'}Experience More 🌏{'\n'}Remember Forever 💜
        </Text>
      </Animated.View>
      <View style={{ width: 120, height: 4, borderRadius: 2, backgroundColor: '#ffffff26', overflow: 'hidden', marginTop: 34 }}>
        <Animated.View style={[{ width: 60, height: 4, borderRadius: 2, backgroundColor: colors.cyan }, progress]} />
      </View>
    </LinearGradient>
  );
}
