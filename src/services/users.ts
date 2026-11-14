import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '../lib/firebase';
import type { NotificationType, UserProfile } from '../types';
import { notify } from './notifications';
import { withId } from './util';

export const DEFAULT_NOTIFICATION_PREFS: Record<NotificationType, boolean> = {
  follow: true,
  like: true,
  comment: true,
  invite: true,
  inviteAccepted: true,
  groupActivity: true,
  video: true,
  expense: true,
  settlement: true,
  budget: true,
};

export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

export function normaliseUsername(u: string) {
  return u.trim().toLowerCase().replace(/^@/, '');
}

/** Creates the user doc right after sign-up (profile setup completes it). */
export async function ensureUserDoc(uid: string, displayName: string, photoURL: string | null) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    uid,
    displayName: displayName || 'Traveller',
    username: '',
    bio: '',
    homeCity: '',
    homeCountry: 'India',
    photoURL,
    visibility: 'public',
    followersCount: 0,
    followingCount: 0,
    appearInLiveWorld: false,
    defaultPostVisibility: 'followers',
    notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
    onboarded: false,
    createdAt: serverTimestamp(),
  });
}

export async function isUsernameAvailable(username: string, uid: string) {
  const snap = await getDoc(doc(db, 'usernames', normaliseUsername(username)));
  return !snap.exists() || snap.data().uid === uid;
}

/** Atomically claims a unique username and completes the profile. */
export async function completeProfile(
  uid: string,
  data: Pick<UserProfile, 'displayName' | 'username' | 'bio' | 'homeCity' | 'homeCountry' | 'visibility'> & {
    photoURL?: string | null;
  },
) {
  const username = normaliseUsername(data.username);
  if (!USERNAME_RE.test(username)) throw new Error('Username must be 3–20 characters: a–z, 0–9, _ or .');
  await runTransaction(db, async (tx) => {
    const nameRef = doc(db, 'usernames', username);
    const userRef = doc(db, 'users', uid);
    const [nameSnap, userSnap] = await Promise.all([tx.get(nameRef), tx.get(userRef)]);
    if (nameSnap.exists() && nameSnap.data().uid !== uid) throw new Error('That username is already taken.');
    const prev = userSnap.data()?.username as string | undefined;
    if (!nameSnap.exists()) tx.set(nameRef, { uid });
    if (prev && prev !== username) tx.delete(doc(db, 'usernames', prev));
    tx.update(userRef, {
      displayName: data.displayName.trim(),
      username,
      bio: data.bio.trim(),
      homeCity: data.homeCity.trim(),
      homeCountry: data.homeCountry.trim() || 'India',
      visibility: data.visibility,
      ...(data.photoURL !== undefined ? { photoURL: data.photoURL } : {}),
      onboarded: true,
    });
  });
}

export async function updateProfile(uid: string, patch: Partial<UserProfile>) {
  await updateDoc(doc(db, 'users', uid), patch as Record<string, unknown>);
}

export function subscribeProfile(uid: string, cb: (p: UserProfile | null) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    doc(db, 'users', uid),
    (s) => cb(s.exists() ? ({ ...(s.data() as UserProfile), uid: s.id }) : null),
    (e) => (onError ? onError(e) : cb(null)),
  );
}

export async function getProfile(uid: string): Promise<UserProfile | null> {
  try {
    const s = await getDoc(doc(db, 'users', uid));
    return s.exists() ? ({ ...(s.data() as UserProfile), uid: s.id }) : null;
  } catch {
    return null; // private profile we are not allowed to read
  }
}

export async function findByUsername(username: string): Promise<UserProfile | null> {
  const s = await getDoc(doc(db, 'usernames', normaliseUsername(username)));
  if (!s.exists()) return null;
  return getProfile(s.data().uid as string);
}

export async function listPublicTravellers(max = 30): Promise<UserProfile[]> {
  const q = query(collection(db, 'users'), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(max));
  const s = await getDocs(q);
  return s.docs.map((d) => ({ ...(d.data() as UserProfile), uid: d.id }));
}

export async function isFollowing(me: string, target: string) {
  return (await getDoc(doc(db, 'users', target, 'followers', me))).exists();
}

export async function getFollowingIds(me: string): Promise<string[]> {
  const s = await getDocs(query(collection(db, 'users', me, 'following'), limit(200)));
  return s.docs.map((d) => d.id);
}

export async function follow(me: UserProfile, targetUid: string) {
  if (me.uid === targetUid) return;
  if (await isFollowing(me.uid, targetUid)) return;
  const b = writeBatch(db);
  b.set(doc(db, 'users', targetUid, 'followers', me.uid), { since: serverTimestamp(), name: me.displayName });
  b.set(doc(db, 'users', me.uid, 'following', targetUid), { since: serverTimestamp() });
  b.update(doc(db, 'users', targetUid), { followersCount: increment(1) });
  b.update(doc(db, 'users', me.uid), { followingCount: increment(1) });
  await b.commit();
  await notify(targetUid, me, 'follow', `${me.displayName} started following you`, `/user/${me.uid}`);
}

export async function unfollow(me: string, targetUid: string) {
  if (!(await isFollowing(me, targetUid))) return;
  const b = writeBatch(db);
  b.delete(doc(db, 'users', targetUid, 'followers', me));
  b.delete(doc(db, 'users', me, 'following', targetUid));
  b.update(doc(db, 'users', targetUid), { followersCount: increment(-1) });
  b.update(doc(db, 'users', me), { followingCount: increment(-1) });
  await b.commit();
}

export async function blockUser(me: string, targetUid: string) {
  await setDoc(doc(db, 'users', me, 'blocked', targetUid), { at: serverTimestamp() });
  await unfollow(me, targetUid).catch(() => {});
  await deleteDoc(doc(db, 'users', me, 'followers', targetUid)).catch(() => {});
}

export async function getBlockedIds(me: string): Promise<string[]> {
  const s = await getDocs(collection(db, 'users', me, 'blocked'));
  return s.docs.map((d) => d.id);
}

export async function isAdmin(uid: string) {
  try {
    return (await getDoc(doc(db, 'admins', uid))).exists();
  } catch {
    return false;
  }
}

export { withId };

/** Public journeys of another traveller (rules allow only visibility == 'public' for non-followers). */
export async function loadPublicJourneys(ownerId: string) {
  const q = query(collection(db, 'journeys'), where('ownerId', '==', ownerId), where('visibility', '==', 'public'), limit(50));
  const s = await getDocs(q);
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as { title: string; cities: string[]; countries: string[]; status: string }) }));
}
