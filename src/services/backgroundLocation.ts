import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import { auth, db } from '../lib/firebase';
import { EMPTY_BG_STATE, needsBackgroundUpdates, type BgState, type RawFix } from '../logic/background';
import { colors } from '../theme';
import { processBackgroundBatch, type BgDeps, type JourneyForWrite } from './backgroundProcessor';
import { saveLocationBatch } from './journeys';

/**
 * Background location (BRD §5.2, §16.6, risk "Background GPS restrictions").
 *
 * While a journey is recording or crew live sharing is on, iOS/Android deliver
 * location updates to BACKGROUND_LOCATION_TASK even when ROAM is in the
 * background or (Android) has been closed. Android runs a foreground service with
 * a persistent notification; iOS shows the blue location indicator — tracking is
 * always visible to the user (BRD §5.4).
 *
 * The task is defined at module load. This module is imported first by the app
 * entry (index.ts) so the task exists in headless launches too.
 */

export const BACKGROUND_LOCATION_TASK = 'roam-background-location';
const STATE_KEY = 'roam.bg.state';
const PREF_KEY = 'roam.bg.enabled';

// ---------------- persistence + Firebase deps ----------------

async function loadState(): Promise<BgState> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    return raw ? { ...EMPTY_BG_STATE, ...JSON.parse(raw) } : EMPTY_BG_STATE;
  } catch {
    return EMPTY_BG_STATE;
  }
}

async function saveState(s: BgState) {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(s)).catch(() => {});
}

async function stopUpdates() {
  if (Platform.OS === 'web') return;
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => {});
  }
}

const deps: BgDeps = {
  loadState,
  saveState,
  async currentUid() {
    await auth.authStateReady(); // restores the persisted session in headless launches
    return auth.currentUser?.uid ?? null;
  },
  async getJourney(id) {
    const s = await getDoc(doc(db, 'journeys', id));
    if (!s.exists()) return null;
    const d = s.data();
    return { id, status: d.status, cityIds: d.cityIds ?? [], route: d.route ?? [], anchorCityId: d.anchorCityId ?? null } as JourneyForWrite;
  },
  saveBatch: (j, points, km) => saveLocationBatch(j, points, km),
  async publishLive(groupId, uid, name, fix) {
    await setDoc(doc(db, 'groups', groupId, 'live', uid), {
      uid,
      name,
      lat: fix.lat,
      lng: fix.lng,
      accuracy: fix.accuracy ?? null,
      updatedAt: Date.now(),
    });
  },
  stopUpdates,
};

// Serialize batch processing (the OS can deliver batches back-to-back).
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn, fn);
  queue = p.catch(() => {});
  return p;
}

// In-app observers (tracker UI, live map) – only present while the app's JS is alive.
type FixObserver = (fixes: RawFix[]) => void;
const observers = new Set<FixObserver>();
export function onBackgroundFixes(fn: FixObserver) {
  observers.add(fn);
  return () => {
    observers.delete(fn);
  };
}

// ---------------- task definition (module load) ----------------

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      console.warn('[ROAM] background location error', error.message);
      return;
    }
    const fixes: RawFix[] = (data?.locations ?? []).map((l) => ({
      lat: l.coords.latitude,
      lng: l.coords.longitude,
      accuracy: l.coords.accuracy ?? null,
      timestamp: l.timestamp,
    }));
    if (!fixes.length) return;
    observers.forEach((o) => o(fixes));
    await enqueue(() => processBackgroundBatch(fixes, deps)).catch((e) => console.warn('[ROAM] background batch failed', e));
  });
}

// ---------------- controller ----------------

export type BackgroundPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

class BackgroundLocationController {
  /** Native app with TaskManager available (not web, not an unsupported runtime). */
  async isSupported(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    return TaskManager.isAvailableAsync().catch(() => false);
  }

  /** Device-level user preference (Settings → "Record in background"). Default on. */
  async isPreferred(): Promise<boolean> {
    return (await AsyncStorage.getItem(PREF_KEY).catch(() => null)) !== '0';
  }

  async setPreferred(on: boolean) {
    await AsyncStorage.setItem(PREF_KEY, on ? '1' : '0').catch(() => {});
    await this.sync();
  }

  async permission(): Promise<BackgroundPermission> {
    if (!(await this.isSupported())) return 'unsupported';
    const p = await Location.getBackgroundPermissionsAsync().catch(() => null);
    return !p ? 'undetermined' : p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
  }

  /**
   * Ask for "Allow all the time". Foreground permission must be granted first.
   * On Android 11+ this opens the system settings page for the app.
   */
  async requestPermission(): Promise<BackgroundPermission> {
    if (!(await this.isSupported())) return 'unsupported';
    const fg = await Location.requestForegroundPermissionsAsync();
    if (!fg.granted) return 'denied';
    const bg = await Location.requestBackgroundPermissionsAsync();
    return bg.granted ? 'granted' : 'denied';
  }

  async isRunning(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    return Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
  }

  /** Set (or clear with null) the journey being recorded. Returns true if background updates are running. */
  async setJourney(uid: string, displayName: string, journeyId: string | null): Promise<boolean> {
    return enqueue(async () => {
      const s = await loadState();
      const sameUser = s.uid === uid;
      await saveState({
        ...(sameUser ? s : EMPTY_BG_STATE),
        uid,
        displayName,
        journeyId,
        // new journey => fresh distance/jitter baseline
        ...(journeyId !== (sameUser ? s.journeyId : null) ? { lastFix: null, pending: [], pendingKm: 0 } : {}),
      });
    }).then(() => this.sync());
  }

  /** Set crew trips being shared with. Returns true if background updates are running. */
  async setShareGroups(uid: string, displayName: string, groups: string[]): Promise<boolean> {
    return enqueue(async () => {
      const s = await loadState();
      await saveState({ ...(s.uid === uid ? s : EMPTY_BG_STATE), uid, displayName, shareGroups: groups });
    }).then(() => this.sync());
  }

  /** Upload any queued points now (e.g. before ending a journey). */
  async flush() {
    if (Platform.OS === 'web') return;
    await enqueue(() => processBackgroundBatch([], deps)).catch(() => {});
  }

  /** Sign-out: stop and forget everything on this device. */
  async clear() {
    await stopUpdates();
    await saveState(EMPTY_BG_STATE);
  }

  /** Start/stop/update OS background updates to match the current state. */
  async sync(): Promise<boolean> {
    if (!(await this.isSupported())) return false;
    const s = await loadState();
    const want = needsBackgroundUpdates(s) && (await this.isPreferred()) && (await this.permission()) === 'granted';
    if (!want) {
      await stopUpdates();
      return false;
    }
    const journey = !!s.journeyId;
    try {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: journey ? Location.Accuracy.Balanced : Location.Accuracy.Low,
        distanceInterval: journey ? 25 : 50,
        timeInterval: journey ? 15_000 : 30_000, // Android
        deferredUpdatesInterval: journey ? 30_000 : 60_000, // batch deliveries to save battery
        deferredUpdatesDistance: journey ? 100 : 200,
        activityType: Location.ActivityType.OtherNavigation, // iOS
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true, // iOS: tracking is always visible
        foregroundService: {
          // Android: persistent notification while tracking (required, and keeps tracking visible)
          notificationTitle: journey ? 'ROAM is recording your journey' : 'Sharing live location with your crew',
          notificationBody: journey ? 'Tap to open. Pause or end the journey any time.' : 'Tap to open ROAM and turn sharing off.',
          notificationColor: colors.cyan,
          killServiceOnDestroy: false,
        },
      });
      return true;
    } catch (e) {
      console.warn('[ROAM] could not start background location', (e as Error).message);
      return false;
    }
  }
}

export const backgroundLocation = new BackgroundLocationController();
