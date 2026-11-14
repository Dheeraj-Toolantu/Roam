import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, type BottomTabBarProps } from 'expo-router/tabs';
import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PulseRing, tap } from '@/components/motion';
import type { IconName } from '@/components/ui';
import { useMe } from '@/lib/session';
import { backgroundLocation } from '@/services/backgroundLocation';
import { liveLocation } from '@/services/location';
import { liveShare } from '@/services/liveShare';
import { colors, gradients } from '@/theme';

const TABS: Record<string, { label: string; icon: IconName; iconOn: IconName }> = {
  index: { label: 'Home', icon: 'home-outline', iconOn: 'home' },
  explore: { label: 'Explore', icon: 'search-outline', iconOn: 'search' },
  capture: { label: 'Capture', icon: 'add', iconOn: 'add' },
  journeys: { label: 'Journeys', icon: 'map-outline', iconOn: 'map' },
  crew: { label: 'Crew', icon: 'people-outline', iconOn: 'people' },
  profile: { label: 'Profile', icon: 'person-outline', iconOn: 'person' },
};

function TabItem({ route, focused, onPress }: { route: { key: string; name: string }; focused: boolean; onPress: () => void }) {
  const meta = TABS[route.name];
  const lift = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    lift.value = withSpring(focused ? 1 : 0, { damping: 12, stiffness: 220 });
  }, [focused, lift]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -3 * lift.value }, { scale: 1 + 0.12 * lift.value }] }));
  const pillStyle = useAnimatedStyle(() => ({ opacity: lift.value, transform: [{ scaleX: 0.6 + 0.4 * lift.value }] }));
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={meta.label}
      testID={`tab-${route.name}`}
      style={styles.item}>
      <Animated.View style={[styles.pill, pillStyle]}>
        <LinearGradient colors={['#22D3EE33', '#8B5CF633']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, borderRadius: 14 }} />
      </Animated.View>
      <Animated.View style={iconStyle}>
        <Ionicons name={focused ? meta.iconOn : meta.icon} size={22} color={focused ? colors.cyan : colors.textMuted} />
      </Animated.View>
      <Text style={[styles.label, focused && { color: colors.cyan }]}>{meta.label}</Text>
    </Pressable>
  );
}

function CaptureButton({ onPress }: { onPress: () => void }) {
  const spin = useSharedValue(0);
  const s = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 90}deg` }] }));
  return (
    <Pressable
      onPress={() => {
        tap('medium');
        spin.set(withSequence(withTiming(1, { duration: 220 }), withTiming(0, { duration: 0 })));
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel="Capture"
      testID="tab-capture"
      style={styles.item}>
      <PulseRing color={colors.violet} size={52}>
        <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.plus}>
          <Animated.View style={s}>
            <Ionicons name="add" size={30} color="#fff" />
          </Animated.View>
        </LinearGradient>
      </PulseRing>
    </Pressable>
  );
}

/** Custom tab bar. Uses the router-provided emitter/navigateToTab (typed by BottomTabBarProps). */
function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bar}>
        {state.routes.map((route, i) => {
          if (!TABS[route.name]) return null;
          const focused = state.index === i;
          const onPress = () => {
            const e = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !e.defaultPrevented) navigateToTab(route.key);
          };
          return route.name === 'capture' ? (
            <CaptureButton key={route.key} onPress={onPress} />
          ) : (
            <TabItem key={route.key} route={route} focused={focused} onPress={onPress} />
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const me = useMe();
  // Automatically detect the user's current location once signed in, and resume any
  // crew live-location sharing the user had turned on before the app was closed.
  useEffect(() => {
    void liveLocation.detect();
    // Restart OS background updates if a journey / crew sharing was active (e.g. after a reboot or update).
    void backgroundLocation.sync();
  }, []);
  useEffect(() => {
    void liveShare.init({ uid: me.uid, displayName: me.displayName });
  }, [me.uid, me.displayName]);
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="capture" />
      <Tabs.Screen name="journeys" />
      <Tabs.Screen name="crew" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 12 },
  bar: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 560,
    backgroundColor: 'rgba(16, 22, 58, 0.97)',
    borderRadius: 28,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 48 },
  label: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  plus: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', shadowColor: '#8B5CF6', shadowOpacity: 0.6, shadowRadius: 14, elevation: 8 },
  pill: { position: 'absolute', top: 2, width: 52, height: 34, borderRadius: 14, overflow: 'hidden' },
});
