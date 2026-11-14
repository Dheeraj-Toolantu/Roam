import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { Platform } from 'react-native';

import { createAuth } from './auth-init';

/**
 * Firebase configuration comes from EXPO_PUBLIC_* env vars (see .env.example).
 * With EXPO_PUBLIC_USE_EMULATORS=1 the app talks to the local Firebase
 * Emulator Suite, which is how the app is developed and tested without a
 * real Firebase project.
 *
 * NOTE: Expo only inlines env vars accessed literally as process.env.EXPO_PUBLIC_X,
 * so never alias process.env.
 */
export const USE_EMULATORS = process.env.EXPO_PUBLIC_USE_EMULATORS === '1';

const config: FirebaseOptions = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'demo-roam.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'demo-roam',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'demo-roam.appspot.com',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:000000000000:web:0000000000000000',
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const isConfigured = USE_EMULATORS || !!process.env.EXPO_PUBLIC_FIREBASE_API_KEY;

const firstInit = getApps().length === 0;
export const app = firstInit ? initializeApp(config) : getApp();
export const auth = createAuth(app);

function makeFirestore(): Firestore {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && !USE_EMULATORS) {
    // Offline-capable cache on web (BRD §16.5 – recover from network interruptions)
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  }
  return initializeFirestore(app, {
    localCache: memoryLocalCache(),
    // React Native's fetch does not support streaming; long-polling is the supported transport.
    experimentalAutoDetectLongPolling: Platform.OS !== 'web',
    ignoreUndefinedProperties: true,
  });
}

export const db = makeFirestore();
export const storage = getStorage(app);

if (USE_EMULATORS && firstInit) {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || (Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1');
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectStorageEmulator(storage, host, 9199);
}
