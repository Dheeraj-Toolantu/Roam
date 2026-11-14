import type { FirebaseApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth';

/** Web: persist the session in localStorage/IndexedDB. */
export function createAuth(app: FirebaseApp) {
  const auth = getAuth(app);
  if (typeof window !== 'undefined') setPersistence(auth, browserLocalPersistence).catch(() => {});
  return auth;
}
