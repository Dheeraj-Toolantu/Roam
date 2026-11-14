import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FirebaseApp } from 'firebase/app';
// The react-native build of firebase/auth exports getReactNativePersistence.
// @ts-expect-error – not present in the web type definitions
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';

/** iOS / Android: persist the session in AsyncStorage so users stay signed in. */
export function createAuth(app: FirebaseApp) {
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    return getAuth(app); // already initialised (fast refresh)
  }
}
