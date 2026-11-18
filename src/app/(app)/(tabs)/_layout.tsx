import { Tabs } from 'expo-router/tabs';
import { useEffect } from 'react';

import { useMe } from '@/lib/session';
import { backgroundLocation } from '@/services/backgroundLocation';
import { liveLocation } from '@/services/location';
import { liveShare } from '@/services/liveShare';
import { colors } from '@/theme';

/** Tab screens. The visible footer is the app-wide <BottomNav /> in the parent layout. */
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
      tabBar={() => null}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="capture" />
      <Tabs.Screen name="journeys" />
      <Tabs.Screen name="crew" />
      <Tabs.Screen name="notifications" />
    </Tabs>
  );
}
