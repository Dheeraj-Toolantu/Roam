import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router/tabs';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from '@/components/ui';
import { useMe } from '@/lib/session';
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

type BarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void; emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean } };
};

function TabBar({ state, navigation }: BarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bar}>
        {state.routes.map((route, i) => {
          const meta = TABS[route.name];
          if (!meta) return null;
          const focused = state.index === i;
          const onPress = () => {
            const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
          };
          if (route.name === 'capture') {
            return (
              <Pressable key={route.key} onPress={onPress} accessibilityRole="button" accessibilityLabel="Capture" testID="tab-capture" style={styles.item}>
                <LinearGradient colors={gradients.primary} style={styles.plus}>
                  <Ionicons name="add" size={28} color="#fff" />
                </LinearGradient>
              </Pressable>
            );
          }
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={meta.label}
              testID={`tab-${route.name}`}
              style={styles.item}>
              <Ionicons name={focused ? meta.iconOn : meta.icon} size={22} color={focused ? colors.cyan : colors.textMuted} />
              <Text style={[styles.label, focused && { color: colors.cyan }]}>{meta.label}</Text>
            </Pressable>
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
  }, []);
  useEffect(() => {
    void liveShare.init({ uid: me.uid, displayName: me.displayName });
  }, [me.uid, me.displayName]);
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(props) => <TabBar {...(props as unknown as BarProps)} />}>
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
  plus: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginTop: -2 },
});
