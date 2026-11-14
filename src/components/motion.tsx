/**
 * ROAM motion kit – small, reusable animations for a playful, modern feel.
 * Built on react-native-reanimated (runs on the UI thread on iOS/Android, CSS/rAF on web).
 * Respects the OS "reduce motion" setting (ReduceMotion.System).
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { colors } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Light haptic tap on phones (no-op on web). */
export function tap(kind: 'light' | 'medium' | 'success' = 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'success') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else void Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// ---------------- entrance ----------------

/** Fade + rise in on mount. Use `index` for a staggered list (capped so long lists don't lag). */
export function Appear({
  children,
  index = 0,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  index?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const entering = useMemo(
    () => FadeInDown.delay(delay + Math.min(index, 8) * 60).springify().damping(18).stiffness(160).reduceMotion(ReduceMotion.System),
    [delay, index],
  );
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}

/** Pop in with a zoom (badges, stickers, success states). */
export function Pop({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const entering = useMemo(() => ZoomIn.delay(delay).springify().damping(12).reduceMotion(ReduceMotion.System), [delay]);
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}

// ---------------- press feedback ----------------

/** Pressable that squishes on press (spring) with a light haptic. */
export function PressScale({
  children,
  style,
  scaleTo = 0.95,
  haptic = true,
  onPress,
  ...rest
}: PressableProps & { children: React.ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number; haptic?: boolean }) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const { outer, inner } = splitLayoutStyle(style);
  return (
    <Pressable
      {...rest}
      style={outer}
      onPress={(e) => {
        if (haptic) tap();
        onPress?.(e);
      }}
      onPressIn={(e) => {
        s.set(withSpring(scaleTo, { damping: 15, stiffness: 400 }));
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.set(withSpring(1, { damping: 12, stiffness: 300 }));
        rest.onPressOut?.(e);
      }}>
      <Animated.View style={[inner, anim]}>{children}</Animated.View>
    </Pressable>
  );
}

/**
 * Layout props (flex, size, margins, positioning) must sit on the outer touchable so
 * the element takes its place in rows/columns; visuals stay on the animated inner view,
 * which fills the outer one.
 */
const LAYOUT_KEYS = new Set([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
  'position', 'top', 'left', 'right', 'bottom', 'zIndex',
]);
export function splitLayoutStyle(style: StyleProp<ViewStyle>) {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) (LAYOUT_KEYS.has(k) ? outer : inner)[k] = v;
  if ('height' in outer || 'flex' in outer || 'minHeight' in outer) inner.flexGrow = 1;
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}

// ---------------- icons ----------------

export const ICON_GRADIENTS = {
  violet: ['#A855F7', '#6366F1'],
  ocean: ['#22D3EE', '#3B82F6'],
  sunset: ['#F97316', '#EC4899'],
  mint: ['#34D399', '#06B6D4'],
  gold: ['#FBBF24', '#F97316'],
  candy: ['#F472B6', '#A855F7'],
  fire: ['#EF4444', '#F59E0B'],
  sky: ['#38BDF8', '#818CF8'],
} as const satisfies Record<string, readonly [string, string]>;
export type IconGradient = keyof typeof ICON_GRADIENTS;

/**
 * Glossy gradient icon tile with a soft glow – the app's signature icon style.
 * `float` adds a gentle hover animation.
 */
export function IconBadge({
  icon,
  gradient = 'violet',
  size = 44,
  rounded = 'squircle',
  float,
  style,
}: {
  icon: IconName;
  gradient?: IconGradient;
  size?: number;
  rounded?: 'squircle' | 'circle';
  float?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = ICON_GRADIENTS[gradient];
  const y = useSharedValue(0);
  useEffect(() => {
    if (!float) return;
    y.value = withRepeat(withSequence(withTiming(-4, { duration: 1400, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.quad) })), -1, false, undefined, ReduceMotion.System);
  }, [float, y]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const r = rounded === 'circle' ? size / 2 : size * 0.32;
  return (
    <Animated.View
      style={[
        { width: size, height: size, borderRadius: r, shadowColor: c[0], shadowOpacity: 0.55, shadowRadius: size * 0.3, shadowOffset: { width: 0, height: size * 0.12 }, elevation: 6 },
        anim,
        style,
      ]}>
      <LinearGradient colors={c} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: r, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {/* glossy highlight */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: size * 0.45, backgroundColor: 'rgba(255,255,255,0.18)', borderBottomLeftRadius: size, borderBottomRightRadius: size }} />
        <Ionicons name={icon} size={size * 0.5} color="#fff" />
      </LinearGradient>
    </Animated.View>
  );
}

// ---------------- loops ----------------

/** Pulsing glow ring behind children (live dots, the capture button). */
export function PulseRing({ color = colors.cyan, size = 56, children }: { color?: string; size?: number; children?: React.ReactNode }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false, undefined, ReduceMotion.System);
  }, [p]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - p.value), transform: [{ scale: 1 + p.value * 0.45 }] }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, ring]} />
      {children}
    </View>
  );
}

/** Blinking "live" dot. */
export function LiveDot({ color = colors.green, size = 8 }: { color?: string; size?: number }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withSequence(withTiming(0.25, { duration: 700 }), withTiming(1, { duration: 700 })), -1, false, undefined, ReduceMotion.System);
  }, [o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, a]} />;
}

/** Wiggle an emoji/element now and then (e.g. the 👋 in the greeting). */
export function Wiggle({ children, every = 3500 }: { children: React.ReactNode; every?: number }) {
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = withRepeat(
      withSequence(withDelay(every, withTiming(14, { duration: 120 })), withTiming(-10, { duration: 120 }), withTiming(10, { duration: 120 }), withTiming(0, { duration: 120 })),
      -1,
      false,
      undefined,
      ReduceMotion.System,
    );
  }, [every, r]);
  const a = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return <Animated.View style={a}>{children}</Animated.View>;
}

// ---------------- loading ----------------

/** Shimmering placeholder block. */
export function Skeleton({ width = '100%', height = 16, radius = 10, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const o = useSharedValue(0.35);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.8, { duration: 850, easing: Easing.inOut(Easing.quad) }), -1, true, undefined, ReduceMotion.System);
  }, [o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.cardAlt }, a, style]} />;
}

/** Skeleton shaped like a post / list card. */
export function SkeletonCard({ media = true }: { media?: boolean }) {
  return (
    <View testID="skeleton" style={{ backgroundColor: colors.card, borderRadius: 22, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.cardBorder, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Skeleton width={38} height={38} radius={19} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="45%" height={12} />
          <Skeleton width="30%" height={10} />
        </View>
      </View>
      <Skeleton width="90%" height={12} />
      {media && <Skeleton height={150} radius={16} />}
    </View>
  );
}

// ---------------- numbers ----------------

/** Animated count-up for stats ("12 Countries"). Formats with `format` (default: integer). */
export function CountUp({
  value,
  duration = 900,
  format = (n: number) => Math.round(n).toLocaleString('en-IN'),
  style,
  testID,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  style?: StyleProp<import('react-native').TextStyle>;
  testID?: string;
}) {
  const [shown, setShown] = useState(value);
  const [from, setFrom] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = Date.now();
    const begin = from;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(begin + (value - begin) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else setFrom(value);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);
  return (
    <Text style={style} testID={testID}>
      {format(shown)}
    </Text>
  );
}

// ---------------- celebration ----------------

const CONFETTI = ['🎉', '✨', '💜', '🌴', '⭐️', '🎊', '💸', '🔥'];

function ConfettiPiece({ i, emoji }: { i: number; emoji: string }) {
  const t = useSharedValue(0);
  // randomness fixed once per piece (not on every render)
  const [{ angle, dist, duration }] = useState(() => ({
    angle: (i / 18) * Math.PI * 2 + Math.random() * 0.4,
    dist: 90 + Math.random() * 90,
    duration: 1300 + Math.random() * 500,
  }));
  useEffect(() => {
    t.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) });
  }, [t, duration]);
  const a = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [
      { translateX: Math.cos(angle) * dist * t.value },
      { translateY: Math.sin(angle) * dist * t.value + 120 * t.value * t.value },
      { rotate: `${t.value * 540}deg` },
      { scale: 0.6 + t.value * 0.6 },
    ],
  }));
  return <Animated.Text style={[{ position: 'absolute', fontSize: 22 }, a]}>{emoji}</Animated.Text>;
}

/** Emoji confetti burst. Re-fires whenever `fire` changes to a new truthy value. */
export function Confetti({ fire }: { fire: number | boolean }) {
  if (!fire) return null;
  return (
    <View pointerEvents="none" key={String(fire)} style={{ position: 'absolute', top: '40%', left: '50%', width: 0, height: 0, alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      {Array.from({ length: 18 }).map((_, i) => (
        <ConfettiPiece key={i} i={i} emoji={CONFETTI[i % CONFETTI.length]} />
      ))}
    </View>
  );
}

/** Big heart that pops and fades (double-tap like). */
export function HeartPop({ show }: { show: number }) {
  const s = useSharedValue(0);
  useEffect(() => {
    if (!show) return;
    s.value = 0;
    s.value = withSequence(withSpring(1.15, { damping: 8 }), withDelay(350, withTiming(0, { duration: 250 })));
  }, [show, s]);
  const a = useAnimatedStyle(() => ({ opacity: s.value > 0.05 ? 1 : 0, transform: [{ scale: s.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }, a]}>
      <Ionicons name="heart" size={96} color="#fff" style={{ textShadowColor: colors.pink, textShadowRadius: 24 }} />
    </Animated.View>
  );
}

/** Scale "pop" when a value flips (e.g. like button). */
export function useBump(trigger: unknown) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withSequence(withSpring(1.35, { damping: 6, stiffness: 400 }), withSpring(1, { damping: 10 }));
  }, [trigger, s]);
  return useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
}
