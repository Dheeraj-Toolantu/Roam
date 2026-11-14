/**
 * In-app confirmation sheets and toast messages.
 *
 * The web build used window.confirm()/alert(), which some environments silently
 * block (in-app browsers, embedded previews, sandboxed frames, "prevent this page
 * from creating dialogs") — confirm() then returns false instantly and buttons like
 * "End journey" appear to do nothing. These are rendered by the app instead, so they
 * always show. iOS/Android keep the native Alert.
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, ZoomIn } from 'react-native-reanimated';

import { colors, radius, type } from '../theme';
import { tap } from './motion';
import { Button } from './ui';

interface ConfirmReq {
  id: number;
  title: string;
  message: string;
  okText: string;
  destructive: boolean;
  resolve: (ok: boolean) => void;
}
interface ToastReq {
  id: number;
  message: string;
}

let seq = 0;
let showConfirm: ((r: ConfirmReq) => void) | null = null;
let showToast: ((t: ToastReq) => void) | null = null;

const inAppDialogs = () => Platform.OS === 'web';

/** Ask the user to confirm an action. Resolves true if they confirm. */
export function confirmAsync(title: string, message: string, okText = 'OK', opts: { destructive?: boolean } = {}): Promise<boolean> {
  if (inAppDialogs() && showConfirm) {
    return new Promise((resolve) => showConfirm!({ id: ++seq, title, message, okText, destructive: opts.destructive ?? true, resolve }));
  }
  if (Platform.OS === 'web') {
    // DialogHost not mounted (shouldn't happen): fall back to the browser dialog
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : true);
  }
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: okText, style: opts.destructive === false ? 'default' : 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

/** Short, non-blocking message. */
export function toast(message: string) {
  if (inAppDialogs() && showToast) return showToast({ id: ++seq, message });
  if (Platform.OS !== 'web') Alert.alert('ROAM', message);
}

/** Mount once at the app root. */
export function DialogHost() {
  const [confirm, setConfirm] = useState<ConfirmReq | null>(null);
  const [toasts, setToasts] = useState<ToastReq[]>([]);

  useEffect(() => {
    showConfirm = (r) =>
      setConfirm((cur) => {
        cur?.resolve(false); // only one at a time
        return r;
      });
    showToast = (t) => {
      setToasts((list) => [...list.slice(-2), t]);
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), 3200);
    };
    return () => {
      showConfirm = null;
      showToast = null;
    };
  }, []);

  const answer = (ok: boolean) => {
    if (!confirm) return;
    tap(ok ? 'medium' : 'light');
    confirm.resolve(ok);
    setConfirm(null);
  };

  return (
    <>
      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => answer(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(3,6,20,0.72)', alignItems: 'center', justifyContent: 'center', padding: 24 }} onPress={() => answer(false)}>
          {confirm && (
            <Animated.View entering={ZoomIn.springify().damping(16)} style={{ width: '100%', maxWidth: 420 }}>
              <Pressable
                accessibilityRole="alert"
                testID="dialog"
                onPress={() => {}}
                style={{ backgroundColor: colors.card, borderRadius: radius.xl, padding: 22, borderWidth: 1, borderColor: colors.cardBorder, gap: 10 }}>
                <View style={{ alignItems: 'center', marginBottom: 4 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: (confirm.destructive ? colors.red : colors.cyan) + '26' }}>
                    <Ionicons name={confirm.destructive ? 'alert-circle' : 'help-circle'} size={30} color={confirm.destructive ? colors.red : colors.cyan} />
                  </View>
                </View>
                <Text style={[type.h2, { textAlign: 'center' }]} testID="dialog-title">
                  {confirm.title}
                </Text>
                {!!confirm.message && <Text style={[type.small, { textAlign: 'center', lineHeight: 20 }]}>{confirm.message}</Text>}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                  <Button title="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => answer(false)} testID="dialog-cancel" />
                  <Button title={confirm.okText} variant={confirm.destructive ? 'danger' : 'primary'} style={{ flex: 1 }} onPress={() => answer(true)} testID="dialog-confirm" />
                </View>
              </Pressable>
            </Animated.View>
          )}
        </Pressable>
      </Modal>

      {toasts.length > 0 && (
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 16, left: 0, right: 0, alignItems: 'center', zIndex: 1000, gap: 8 }}>
          {toasts.map((t) => (
            <Animated.View key={t.id} entering={FadeInUp.springify()} exiting={FadeOutUp} style={{ maxWidth: 520, width: '92%' }}>
              <Pressable
                testID="toast"
                accessibilityRole="alert"
                onPress={() => setToasts((l) => l.filter((x) => x.id !== t.id))}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.cardAlt, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: colors.cyan + '55' }}>
                <Ionicons name="checkmark-circle" size={20} color={colors.cyan} />
                <Text style={{ color: colors.text, flex: 1, fontWeight: '600' }}>{t.message}</Text>
              </Pressable>
            </Animated.View>
          ))}
        </View>
      )}
    </>
  );
}
