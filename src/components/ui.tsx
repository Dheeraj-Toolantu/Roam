import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { initials } from '../services/util';
import { CountUp, IconBadge, PressScale, SkeletonCard, type IconGradient } from './motion';
import { colors, gradients, radius, shadows, space, type } from '../theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ---------------- Layout ----------------

export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
  contentStyle,
  edges = ['top'],
  ...rest
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom')[];
} & ScrollViewProps) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[padded && { padding: space.lg, paddingBottom: 40 }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...rest}>
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && { padding: space.lg }, contentStyle]}>{children}</View>
  );
  return (
    <LinearGradient colors={gradients.screen} style={[{ flex: 1 }, style]}>
      <SafeAreaView edges={edges} style={{ flex: 1 }}>
        <View style={styles.maxWidth}>{content}</View>
      </SafeAreaView>
    </LinearGradient>
  );
}

export function Header({
  title,
  subtitle,
  back = true,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      {back && (
        <IconButton
          icon="chevron-back"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      )}
      <View style={{ flex: 1, marginLeft: back ? space.md : 0 }}>
        <Text style={type.h2} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={type.small} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}

export function Row({ children, style, gap = space.sm, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number; testID?: string }) {
  return (
    <View testID={testID} style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>
      {children}
    </View>
  );
}

export function Spacer({ h = space.lg }: { h?: number }) {
  return <View style={{ height: h }} />;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.md }}>
      <Text style={type.h3}>{title}</Text>
      {!!action && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={{ color: colors.brand, fontWeight: '700', fontSize: 13 }}>{action}</Text>
        </Pressable>
      )}
    </Row>
  );
}

// ---------------- Brand ----------------

export function Logo({ size = 64 }: { size?: number }) {
  // Stylised "A"-arch mark in brand gradient
  return (
    <View style={{ width: size, height: size * 0.9, alignItems: 'center', justifyContent: 'flex-end' }}>
      <LinearGradient
        colors={gradients.logo}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={{
          width: size,
          height: size * 0.9,
          borderTopLeftRadius: size / 2,
          borderTopRightRadius: size / 2,
          borderBottomLeftRadius: size * 0.12,
          borderBottomRightRadius: size * 0.12,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          width: size * 0.46,
          height: size * 0.5,
          backgroundColor: '#fff',
          borderTopLeftRadius: size * 0.23,
          borderTopRightRadius: size * 0.23,
        }}
      />
    </View>
  );
}

export function Wordmark({ size = 34 }: { size?: number }) {
  return (
    <Text style={{ fontSize: size, fontWeight: '900', color: colors.text, letterSpacing: 1 }}>
      RO<Text style={{ color: colors.brand }}>AM</Text>
    </Text>
  );
}

// ---------------- Buttons ----------------

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  iconRight,
  loading,
  disabled,
  style,
  small,
  testID,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'purple' | 'light';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  testID?: string;
}) {
  const grad =
    variant === 'primary'
      ? gradients.primary
      : variant === 'purple'
        ? gradients.purple
        : variant === 'danger'
          ? gradients.danger
          : variant === 'success'
            ? gradients.success
            : null;
  const textColor = grad ? '#fff' : variant === 'light' ? '#111' : colors.text;
  const inner = (
    <Row gap={8} style={{ justifyContent: 'center' }}>
      {loading ? <ActivityIndicator color={textColor} /> : icon ? <Ionicons name={icon} size={small ? 16 : 18} color={textColor} /> : null}
      <Text style={{ color: textColor, fontWeight: '700', fontSize: small ? 13 : 16 }}>{title}</Text>
      {iconRight && !loading && <Ionicons name={iconRight} size={small ? 16 : 18} color={textColor} />}
    </Row>
  );
  const h = small ? 38 : 52;
  return (
    <PressScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled || loading}
      scaleTo={0.96}
      style={[{ opacity: disabled ? 0.5 : 1, borderRadius: radius.pill }, grad && !disabled ? styles.btnGlow : null, style]}>
      {grad ? (
        <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.btn, { height: h }]}>
          {inner}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.btn,
            { height: h },
            variant === 'secondary' && { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.cardBorder, ...shadows.soft },
            variant === 'ghost' && { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.cardBorder },
            variant === 'light' && { backgroundColor: '#fff' },
          ]}>
          {inner}
        </View>
      )}
    </PressScale>
  );
}

export function IconButton({
  icon,
  onPress,
  size = 20,
  color = colors.text,
  badge,
  style,
  accessibilityLabel,
}: {
  icon: IconName;
  onPress?: () => void;
  size?: number;
  color?: string;
  badge?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? icon} hitSlop={8} scaleTo={0.88} style={[styles.iconBtn, style]}>
      <Ionicons name={icon} size={size} color={color} />
      {!!badge && badge > 0 && (
        <View style={styles.badge}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
    </PressScale>
  );
}

// ---------------- Surfaces ----------------

export function Card({ children, style, onPress, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string }) {
  if (onPress)
    return (
      <PressScale testID={testID} onPress={onPress} scaleTo={0.97} style={[styles.card, style]}>
        {children}
      </PressScale>
    );
  return (
    <View testID={testID} style={[styles.card, style]}>
      {children}
    </View>
  );
}

export function GradientCard({
  colors: c,
  children,
  style,
  onPress,
}: {
  colors: readonly [string, string, ...string[]];
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const body = (
    <LinearGradient colors={c} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: radius.lg, padding: space.lg, overflow: 'hidden' }, style]}>
      {children}
    </LinearGradient>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

export function Pill({ text, color = colors.cyan, icon, style }: { text: string; color?: string; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.pill, { backgroundColor: color + '22', borderColor: color + '55' }, style]}>
      {icon && <Ionicons name={icon} size={12} color={color} />}
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

export function Chip({ label, active, onPress, icon, testID }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[styles.chip, active && { backgroundColor: colors.ink, borderColor: colors.ink }]}>
      {icon && <Ionicons name={icon} size={14} color={active ? '#fff' : colors.textMuted} />}
      <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string; badge?: number }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.id)}
            style={{ flex: 1, borderRadius: radius.pill, overflow: 'hidden' }}>
            {on ? (
              <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.segmentItem}>
                <Text style={styles.segmentTextOn}>{o.label}</Text>
              </LinearGradient>
            ) : (
              <View style={styles.segmentItem}>
                <Text style={styles.segmentText}>{o.label}</Text>
                {!!o.badge && (
                  <View style={[styles.badge, { position: 'relative', top: 0, right: 0, marginLeft: 6 }]}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{o.badge}</Text>
                  </View>
                )}
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stat({ value, label, icon, color = colors.text }: { value: string | number; label: string; icon?: IconName; color?: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      {icon && <Ionicons name={icon} size={16} color={colors.textMuted} style={{ marginBottom: 2 }} />}
      {typeof value === 'number' ? (
        <CountUp value={value} style={{ color, fontSize: 18, fontWeight: '800' }} />
      ) : (
        <Text style={{ color, fontSize: 18, fontWeight: '800' }}>{value}</Text>
      )}
      <Text style={[type.tiny, { textAlign: 'center' }]}>{label}</Text>
    </View>
  );
}

export function Avatar({ name, uri, size = 40, ring }: { name?: string | null; uri?: string | null; size?: number; ring?: boolean }) {
  const hue = ((name ?? '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 47) % 360;
  const inner = uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `hsl(${hue}, 60%, 45%)`,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{initials(name)}</Text>
    </View>
  );
  if (!ring) return inner;
  return (
    <LinearGradient colors={gradients.brand} style={{ padding: 2, borderRadius: size }}>
      <View style={{ padding: 2, backgroundColor: '#fff', borderRadius: size }}>{inner}</View>
    </LinearGradient>
  );
}

export function AvatarStack({ names, max = 4, size = 30 }: { names: string[]; max?: number; size?: number }) {
  return (
    <Row gap={0}>
      {names.slice(0, max).map((n, i) => (
        <View key={n + i} style={{ marginLeft: i ? -size / 3 : 0, borderWidth: 2, borderColor: '#fff', borderRadius: size }}>
          <Avatar name={n} size={size} />
        </View>
      ))}
      {names.length > max && (
        <View style={[styles.more, { width: size, height: size, borderRadius: size, marginLeft: -size / 3 }]}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>+{names.length - max}</Text>
        </View>
      )}
    </Row>
  );
}

// ---------------- Inputs ----------------

export function Field({
  label,
  icon,
  right,
  style,
  inputStyle,
  ...props
}: TextInputProps & { label?: string; icon?: IconName; right?: React.ReactNode; inputStyle?: StyleProp<TextStyle> }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={[{ marginBottom: space.md }, style as StyleProp<ViewStyle>]}>
      {!!label && <Text style={[type.small, { marginBottom: 6, fontWeight: '600' }]}>{label}</Text>}
      {/* Focus is shown on the container (cyan border) instead of the browser's default outline. */}
      <View style={[styles.field, focused && { borderColor: colors.cyan }]}>
        {icon && <Ionicons name={icon} size={18} color={focused ? colors.cyan : colors.textDim} style={{ marginRight: 8 }} />}
        <TextInput
          placeholderTextColor={colors.textDim}
          style={[{ flex: 1, minWidth: 0, color: colors.text, fontSize: 15, paddingVertical: 12, outlineStyle: 'none' } as unknown as TextStyle, inputStyle]}
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
        />
        {right}
      </View>
    </View>
  );
}

export function Toggle({ value, onChange, label, hint, testID }: { value: boolean; onChange: (v: boolean) => void; label: string; hint?: string; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={type.body}>{label}</Text>
        {!!hint && <Text style={type.tiny}>{hint}</Text>}
      </View>
      <View style={[styles.switch, value && { backgroundColor: colors.cyan }]}>
        <View style={[styles.knob, value && { transform: [{ translateX: 20 }] }]} />
      </View>
    </Pressable>
  );
}

// ---------------- Feedback ----------------

export function Empty({
  icon = 'compass-outline',
  title,
  text,
  action,
  gradient = 'ocean',
}: {
  icon?: IconName;
  title: string;
  text?: string;
  action?: React.ReactNode;
  gradient?: IconGradient;
}) {
  return (
    <View style={{ alignItems: 'center', padding: space.xl, gap: 8 }}>
      <IconBadge icon={icon} gradient={gradient} size={68} rounded="circle" float style={{ marginBottom: 8 }} />
      <Text style={[type.h3, { textAlign: 'center' }]}>{title}</Text>
      {!!text && <Text style={[type.small, { textAlign: 'center', lineHeight: 19 }]}>{text}</Text>}
      {action}
    </View>
  );
}

/** Full-screen loading: shimmering skeleton cards (feels faster than a spinner). */
export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ flex: 1, padding: 4, paddingTop: 8 }} accessibilityLabel={label ?? 'Loading'}>
      {!!label && <Text style={[type.small, { marginBottom: 10 }]}>{label}</Text>}
      <SkeletonCard media={false} />
      <SkeletonCard />
      <SkeletonCard media={false} />
    </View>
  );
}

export function ErrorText({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <View accessibilityRole="alert" style={styles.error}>
      <Ionicons name="alert-circle" size={16} color={colors.red} />
      <Text style={{ color: '#BE123C', flex: 1, fontSize: 13 }}>{text}</Text>
    </View>
  );
}

export function InfoText({ text, icon = 'information-circle' }: { text: string; icon?: IconName }) {
  return (
    <View style={[styles.error, { backgroundColor: colors.cyan + '14', borderColor: colors.cyan + '40' }]}>
      <Ionicons name={icon} size={16} color={colors.cyan} />
      <Text style={{ color: colors.textMuted, flex: 1, fontSize: 13 }}>{text}</Text>
    </View>
  );
}

export function ProgressBar({ pct, color = colors.cyan, height = 8 }: { pct: number; color?: string; height?: number }) {
  return (
    <View style={{ height, backgroundColor: colors.cardAlt, borderRadius: height, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height, backgroundColor: color, borderRadius: height }} />
    </View>
  );
}

const QUICK_GRADIENT: Record<string, IconGradient> = {};
export function QuickAction({
  icon,
  label,
  onPress,
  colors: c,
  testID,
  gradient,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  colors: readonly [string, string];
  testID?: string;
  gradient?: IconGradient;
}) {
  return (
    <PressScale testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1 }} scaleTo={0.92}>
      <LinearGradient colors={['#FFFFFF', c[0] + '14']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.quick}>
        <IconBadge icon={icon} gradient={gradient ?? QUICK_GRADIENT[label] ?? 'violet'} size={42} />
        <Text style={{ color: colors.text, fontSize: 11, fontWeight: '800', textAlign: 'center', letterSpacing: 0.2 }} numberOfLines={2}>
          {label}
        </Text>
      </LinearGradient>
    </PressScale>
  );
}

export function useBottomPad() {
  const insets = useSafeAreaInsets();
  return insets.bottom + 24;
}

export type { PressableProps };

const styles = StyleSheet.create({
  maxWidth: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: space.lg },
  btn: { borderRadius: radius.pill, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  btnGlow: shadows.glow,
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.brand,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    ...shadows.soft,
  },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, alignSelf: 'flex-start' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  segment: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.pill, padding: 4, borderWidth: 1, borderColor: colors.cardBorder },
  segmentItem: { paddingVertical: 9, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', borderRadius: radius.pill },
  segmentText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  segmentTextOn: { color: '#fff', fontWeight: '800', fontSize: 13 },
  more: { backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  switch: { width: 46, height: 26, borderRadius: 13, backgroundColor: '#D4D2EC', padding: 3 },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.red + '1A',
    borderWidth: 1,
    borderColor: colors.red + '55',
    marginVertical: space.sm,
  },
  quick: {
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    minHeight: 92,
    ...shadows.soft,
  },
  quickIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});

/** Go back if there is history (normal navigation), otherwise go to `fallback` (deep links, refreshes). */
export function goBackOr(fallback: Parameters<typeof router.replace>[0]) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
