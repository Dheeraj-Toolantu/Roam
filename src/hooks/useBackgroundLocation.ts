import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { backgroundLocation, type BackgroundPermission } from '../services/backgroundLocation';

export interface BackgroundStatus {
  supported: boolean;
  permission: BackgroundPermission;
  preferred: boolean;
  /** Background recording will actually be used. */
  active: boolean;
}

/** Background-location capability, permission and user preference (refreshes when the app returns to foreground, e.g. from Settings). */
export function useBackgroundLocation() {
  const [status, setStatus] = useState<BackgroundStatus | null>(null);

  const refresh = useCallback(async () => {
    const [supported, permission, preferred] = await Promise.all([
      backgroundLocation.isSupported(),
      backgroundLocation.permission(),
      backgroundLocation.isPreferred(),
    ]);
    setStatus({ supported, permission, preferred, active: supported && preferred && permission === 'granted' });
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refresh());
    return () => sub.remove();
  }, [refresh]);

  const setPreferred = useCallback(
    async (on: boolean) => {
      await backgroundLocation.setPreferred(on);
      await refresh();
    },
    [refresh],
  );

  const requestPermission = useCallback(async () => {
    const r = await backgroundLocation.requestPermission();
    await refresh();
    await backgroundLocation.sync();
    return r;
  }, [refresh]);

  return { status, refresh, setPreferred, requestPermission };
}
