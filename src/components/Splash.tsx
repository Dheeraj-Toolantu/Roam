import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Text, View } from 'react-native';

import { colors } from '../theme';
import { Logo, Wordmark } from './ui';

export function Splash() {
  const [fade] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: true }).start();
  }, [fade]);
  return (
    <LinearGradient colors={['#2A1B6B', '#5B2A86', '#C2410C']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ alignItems: 'center', opacity: fade, transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}>
        <Logo size={92} />
        <View style={{ height: 18 }} />
        <Wordmark size={44} />
        <Text style={{ color: '#fff', opacity: 0.85, fontSize: 18, textAlign: 'center', marginTop: 14, lineHeight: 26 }}>
          Explore Together.{'\n'}Experience More.{'\n'}Remember Forever.
        </Text>
        <ActivityIndicator color={colors.cyan} style={{ marginTop: 32 }} />
      </Animated.View>
    </LinearGradient>
  );
}
