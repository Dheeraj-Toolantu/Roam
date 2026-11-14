/**
 * Background-location integration: runs the real background batch processor with
 * Firestore deps equivalent to src/services/backgroundLocation.ts, as a signed-in
 * user against the emulator — proving background writes pass the security rules
 * and update the journey + crew live location correctly.
 */
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, type Auth } from 'firebase/auth';
import {
  addDoc,
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  increment,
  initializeFirestore,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EMPTY_BG_STATE, type BgState } from '../../src/logic/background';
import { locationBatchUpdate } from '../../src/logic/journeyUpdate';
import { processBackgroundBatch, type BgDeps, type JourneyForWrite } from '../../src/services/backgroundProcessor';

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let uid = '';
let journeyId = '';
let groupId = '';
let state: BgState = EMPTY_BG_STATE;
let stopped = 0;

const deps = (): BgDeps => ({
  loadState: async () => state,
  saveState: async (s) => {
    state = s;
  },
  currentUid: async () => {
    await auth.authStateReady();
    return auth.currentUser?.uid ?? null;
  },
  getJourney: async (id) => {
    const s = await getDoc(doc(db, 'journeys', id));
    if (!s.exists()) return null;
    const d = s.data();
    return { id, status: d.status, cityIds: d.cityIds ?? [], route: d.route ?? [], anchorCityId: d.anchorCityId ?? null } as JourneyForWrite;
  },
  saveBatch: async (j, points, km) => {
    const b = writeBatch(db);
    for (const p of points) b.set(doc(collection(db, 'journeys', j.id, 'locations')), { ...p, excluded: false });
    b.update(doc(db, 'journeys', j.id), { distanceKm: increment(km), ...locationBatchUpdate(j, points) });
    await b.commit();
  },
  publishLive: async (g, u, name, fix) => {
    await setDoc(doc(db, 'groups', g, 'live', u), { uid: u, name, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy ?? null, updatedAt: Date.now() });
  },
  stopUpdates: async () => {
    stopped++;
  },
});

const walk = (n: number, t0 = Date.now()) =>
  Array.from({ length: n }, (_, i) => ({ lat: 15.5553 - i * 0.00135, lng: 73.7517, accuracy: 10, timestamp: t0 + i * 60_000 }));

beforeAll(async () => {
  app = initializeApp({ apiKey: 'demo', projectId: 'demo-roam', authDomain: 'demo-roam.firebaseapp.com' }, `bg-${Date.now()}`);
  auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  db = initializeFirestore(app, {});
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  uid = (await createUserWithEmailAndPassword(auth, `bg.${Date.now()}@roam.test`, 'password123')).user.uid;
  journeyId = (
    await addDoc(collection(db, 'journeys'), {
      ownerId: uid, ownerName: 'Dheeraj', title: 'Goa', type: 'solo', groupId: null, status: 'active', visibility: 'private',
      startedAt: Date.now(), endedAt: null, pausedMs: 0, pausedAt: null, distanceKm: 0, cities: [], cityIds: [], countries: [],
      continents: [], placesCount: 0, photos: 0, videos: 0, activitiesCount: 0, lastPoint: null, anchorCityId: null, coverUrl: null, route: [],
    })
  ).id;
  groupId = `bg-group-${Date.now()}`;
  await setDoc(doc(db, 'groups', groupId), {
    name: 'Goa Trip', ownerId: uid, adminIds: [uid], memberIds: [uid], memberNames: { [uid]: 'Dheeraj' }, visibility: 'private', inviteCode: 'X', videoExcludedUids: [],
  });
  state = { ...EMPTY_BG_STATE, uid, displayName: 'Dheeraj', journeyId, shareGroups: [groupId] };
});

afterAll(async () => {
  await deleteApp(app);
});

describe('background location → Firestore', () => {
  it('stores background fixes on the journey and publishes crew live location', async () => {
    const out = await processBackgroundBatch(walk(5), deps());
    expect(out).toMatchObject({ written: 5, stopped: false, published: [groupId] });

    const j = (await getDoc(doc(db, 'journeys', journeyId))).data()!;
    expect(j.distanceKm).toBeCloseTo(0.6, 1);
    expect(j.cities).toEqual(['Goa']);
    expect(j.anchorCityId).toBe('goa');
    expect(j.route).toHaveLength(5);
    expect((await getDocs(collection(db, 'journeys', journeyId, 'locations'))).size).toBe(5);

    const live = (await getDoc(doc(db, 'groups', groupId, 'live', uid))).data()!;
    expect(live.lat).toBeCloseTo(walk(5)[4].lat, 5);
  });

  it('a re-delivered batch does not double count', async () => {
    const before = (await getDoc(doc(db, 'journeys', journeyId))).data()!.distanceKm;
    await processBackgroundBatch(walk(5, Date.now() - 10 * 60_000), deps()); // older timestamps
    expect((await getDoc(doc(db, 'journeys', journeyId))).data()!.distanceKm).toBeCloseTo(before, 6);
  });

  it('stops recording once the journey has been ended in the app', async () => {
    await updateDoc(doc(db, 'journeys', journeyId), { status: 'completed', endedAt: Date.now() });
    state = { ...state, shareGroups: [] };
    const out = await processBackgroundBatch(walk(2, Date.now() + 3_600_000), deps());
    expect(out).toMatchObject({ written: 0, stopped: true, reason: 'journey-ended' });
    expect(state.journeyId).toBeNull();
    expect(stopped).toBe(1);
  });
});
