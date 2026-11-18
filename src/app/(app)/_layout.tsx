import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { BottomNav } from '@/components/BottomNav';
import { Splash } from '@/components/Splash';
import { Button, Logo } from '@/components/ui';
import { ONBOARDING_KEY } from '@/lib/constants';
import { signOut, useSession } from '@/lib/session';
import { colors, type } from '@/theme';

/** Guard for everything that requires an account (BR-001). */
export default function AppLayout() {
  const { user, profile, loading } = useSession();
  const [seen, setSeen] = useState<boolean | null>(null);
  const [minSplash, setMinSplash] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((v) => setSeen(v === '1'))
      .catch(() => setSeen(true));
    const t = setTimeout(() => setMinSplash(false), 900);
    return () => clearTimeout(t);
  }, []);

  if (loading || seen === null || minSplash) return <Splash />;
  if (!user) return <Redirect href={seen ? '/login' : '/onboarding'} />;
  if (!profile) return <Splash />;
  if (profile.suspended) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
        <Logo size={56} />
        <Text style={type.h2}>Account suspended</Text>
        <Text style={[type.small, { textAlign: 'center' }]}>
          Your account has been suspended by a ROAM moderator. Contact support if you think this is a mistake.
        </Text>
        <Button title="Sign out" variant="secondary" onPress={() => signOut()} />
      </View>
    );
  }
  if (!profile.onboarded) return <Redirect href="/profile-setup" />;

  // The footer sits under the navigator (not floating over it), so it is on every page
  // and never covers content.
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
          <Stack.Screen name="stories" options={{ animation: 'fade', presentation: 'fullScreenModal' }} />
        </Stack>
      </View>
      <BottomNav />
    </View>
  );
}
