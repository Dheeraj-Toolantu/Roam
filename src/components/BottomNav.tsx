import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, usePathname, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMe } from '../lib/session';
import { subscribeNotifications } from '../services/notifications';
import { colors, gradients, shadows } from '../theme';
import { tap } from './motion';
import type { IconName } from './ui';

type Item = { key: string; label: string; href: Href; icon: IconName; iconOn: IconName; match: (p: string) => boolean };

/** Footer items. Notifications replaces the old Explore (search) tab; Explore stays reachable from Home. */
const ITEMS: Item[] = [
  { key: 'home', label: 'Home', href: '/', icon: 'home-outline', iconOn: 'home', match: (p) => p === '/' || p.startsWith('/explore') || p.startsWith('/travel') },
  { key: 'alerts', label: 'Alerts', href: '/notifications', icon: 'notifications-outline', iconOn: 'notifications', match: (p) => p.startsWith('/notifications') },
  { key: 'capture', label: 'Capture', href: '/capture', icon: 'add', iconOn: 'add', match: (p) => p.startsWith('/capture') },
  { key: 'journeys', label: 'Journeys', href: '/journeys', icon: 'map-outline', iconOn: 'map', match: (p) => p.startsWith('/journey') },
  { key: 'crew', label: 'Crew', href: '/crew', icon: 'people-outline', iconOn: 'people', match: (p) => p.startsWith('/crew') || p.startsWith('/trip') },
];

/** Full-screen experiences that keep the whole screen to themselves. */
const HIDDEN = ['/stories', '/magic'];

function NavItem({ item, active, badge }: { item: Item; active: boolean; badge?: number }) {
  const lift = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    lift.value = withSpring(active ? 1 : 0, { damping: 14, stiffness: 220 });
  }, [active, lift]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -2 * lift.value }, { scale: 1 + 0.08 * lift.value }] }));
  const barStyle = useAnimatedStyle(() => ({ opacity: lift.value, transform: [{ scaleX: 0.3 + 0.7 * lift.value }] }));
  return (
    <Pressable
      onPress={() => {
        tap();
        router.navigate(item.href);
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={badge ? `${item.label}, ${badge} unread` : item.label}
      testID={`tab-${item.key}`}
      style={styles.item}>
      <Animated.View style={[styles.activeBar, barStyle]} />
      <Animated.View style={iconStyle}>
        <Ionicons name={active ? item.iconOn : item.icon} size={22} color={active ? colors.brand : colors.textDim} />
        {!!badge && badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </Animated.View>
      <Text style={[styles.label, active && { color: colors.brand }]}>{item.label}</Text>
    </Pressable>
  );
}

function CaptureItem({ active }: { active: boolean }) {
  const spin = useSharedValue(0);
  const s = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 90}deg` }] }));
  return (
    <Pressable
      onPress={() => {
        tap('medium');
        spin.set(withSequence(withTiming(1, { duration: 220 }), withTiming(0, { duration: 0 })));
        router.navigate('/capture');
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel="Capture"
      testID="tab-capture"
      style={styles.item}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.plus}>
        <Animated.View style={s}>
          <Ionicons name="add" size={28} color="#fff" />
        </Animated.View>
      </LinearGradient>
    </Pressable>
  );
}

/**
 * App-wide footer (JodoDeal-style white tab bar). Rendered once by the signed-in layout,
 * so it stays on every page — tabs and pushed screens alike.
 */
export function BottomNav() {
  const me = useMe();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [unread, setUnread] = useState(0);
  const [keyboard, setKeyboard] = useState(false);

  useEffect(
    () => subscribeNotifications(me.uid, (n) => setUnread(n.filter((x) => !x.read && me.notificationPrefs?.[x.type] !== false).length)),
    [me.uid, me.notificationPrefs],
  );
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const a = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);

  if (keyboard || HIDDEN.some((h) => pathname.startsWith(h))) return null;

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 6) }]} accessibilityRole="tablist" testID="bottom-nav">
      <View style={styles.bar}>
        {ITEMS.map((it) =>
          it.key === 'capture' ? (
            <CaptureItem key={it.key} active={it.match(pathname)} />
          ) : (
            <NavItem key={it.key} item={it} active={it.match(pathname)} badge={it.key === 'alerts' ? unread : undefined} />
          ),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: 'rgba(255,255,255,0.97)', borderTopWidth: 1, borderTopColor: colors.cardBorder, ...shadows.soft, shadowOffset: { width: 0, height: -4 } },
  bar: { flexDirection: 'row', width: '100%', maxWidth: 560, alignSelf: 'center', paddingTop: 6 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 52 },
  activeBar: { position: 'absolute', top: -6, width: 28, height: 3, borderRadius: 3, backgroundColor: colors.brand },
  label: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  plus: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', ...shadows.glow },
  badge: {
    position: 'absolute',
    top: -5,
    right: -10,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.brand,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
