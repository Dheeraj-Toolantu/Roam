import type { DocumentSnapshot, QueryDocumentSnapshot, Timestamp } from 'firebase/firestore';

export function withId<T>(snap: QueryDocumentSnapshot | DocumentSnapshot): T {
  return { id: snap.id, ...(snap.data() as object) } as T;
}

export function tsToMs(t: Timestamp | number | null | undefined): number {
  if (t == null) return Date.now(); // pending server timestamp
  if (typeof t === 'number') return t;
  return t.toMillis();
}

export function timeAgo(t: Timestamp | number | null | undefined): string {
  const diff = Date.now() - tsToMs(t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(tsToMs(t)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function clockTime(t: Timestamp | number | null | undefined): string {
  return new Date(tsToMs(t)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(len = 8): string {
  let out = '';
  const bytes = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function randomId(): string {
  return `${Date.now().toString(36)}${randomCode(10).toLowerCase()}`;
}

export function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function errorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/email-already-in-use': 'An account already exists with this email.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'permission-denied': 'You do not have permission to do that.',
    unavailable: 'You appear to be offline. Changes will sync when you reconnect.',
  };
  if (map[code]) return map[code];
  if (e instanceof Error) return e.message.replace(/^Firebase: /, '').replace(/ \(.*\)\.?$/, '');
  return 'Something went wrong. Please try again.';
}
