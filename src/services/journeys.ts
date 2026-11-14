import {
  addDoc,
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
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { CITIES } from '../data/cities';
import { db } from '../lib/firebase';
import { endJourney, pauseJourney, resumeJourney } from '../logic/journey';
import type { Activity, ActivityType, Journey, UserProfile, Visibility } from '../types';
import { withId } from './util';

export async function startJourney(
  me: UserProfile,
  opts: { title: string; type: 'solo' | 'group'; groupId?: string | null; visibility: Visibility },
): Promise<string> {
  const active = await getActiveJourney(me.uid);
  if (active) throw new Error('You already have a journey in progress. End it before starting a new one.');
  const now = Date.now();
  const data: Omit<Journey, 'id'> = {
    ownerId: me.uid,
    ownerName: me.displayName,
    title: opts.title.trim() || 'My Journey',
    type: opts.type,
    groupId: opts.type === 'group' ? (opts.groupId ?? null) : null,
    status: 'active',
    visibility: opts.visibility,
    startedAt: now,
    endedAt: null,
    pausedMs: 0,
    pausedAt: null,
    distanceKm: 0,
    cities: [],
    cityIds: [],
    countries: [],
    continents: [],
    placesCount: 0,
    photos: 0,
    videos: 0,
    activitiesCount: 0,
    lastPoint: null,
    anchorCityId: null,
    coverUrl: null,
    route: [],
  };
  const ref = await addDoc(collection(db, 'journeys'), data);
  await addActivity(ref.id, { type: 'start', title: 'Journey started', caption: '', visibility: 'private' });
  return ref.id;
}

export async function getJourney(id: string): Promise<Journey | null> {
  const s = await getDoc(doc(db, 'journeys', id));
  return s.exists() ? withId<Journey>(s) : null;
}

export function subscribeJourney(id: string, cb: (j: Journey | null) => void) {
  return onSnapshot(doc(db, 'journeys', id), (s) => cb(s.exists() ? withId<Journey>(s) : null), () => cb(null));
}

export async function getActiveJourney(uid: string): Promise<Journey | null> {
  const q = query(collection(db, 'journeys'), where('ownerId', '==', uid), orderBy('startedAt', 'desc'), limit(5));
  const s = await getDocs(q);
  const j = s.docs.map((d) => withId<Journey>(d)).find((x) => x.status !== 'completed');
  return j ?? null;
}

export function subscribeMyJourneys(uid: string, cb: (j: Journey[]) => void) {
  const q = query(collection(db, 'journeys'), where('ownerId', '==', uid), orderBy('startedAt', 'desc'), limit(100));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => withId<Journey>(d))), () => cb([]));
}

export async function pause(j: Journey) {
  const t = pauseJourney(j);
  await updateDoc(doc(db, 'journeys', j.id), { status: t.status, pausedAt: t.pausedAt });
}

export async function resume(j: Journey) {
  const t = resumeJourney(j);
  await updateDoc(doc(db, 'journeys', j.id), { status: t.status, pausedAt: null, pausedMs: t.pausedMs });
}

export async function end(j: Journey) {
  const t = endJourney(j);
  await updateDoc(doc(db, 'journeys', j.id), {
    status: 'completed',
    endedAt: t.endedAt,
    pausedMs: t.pausedMs,
    pausedAt: null,
  });
  await addActivity(j.id, { type: 'end', title: 'Journey ended', caption: '', visibility: 'private' });
}

export async function updateJourney(id: string, patch: Partial<Pick<Journey, 'title' | 'visibility' | 'coverUrl'>>) {
  await updateDoc(doc(db, 'journeys', id), patch);
}

export async function deleteJourney(id: string) {
  // Delete GPS history first (BRD §5.4 – users can delete location history)
  await clearLocationHistory(id);
  const acts = await getDocs(collection(db, 'journeys', id, 'activities'));
  await Promise.all(acts.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'journeys', id));
}

export async function clearLocationHistory(id: string) {
  const s = await getDocs(collection(db, 'journeys', id, 'locations'));
  for (let i = 0; i < s.docs.length; i += 400) {
    const b = writeBatch(db);
    s.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
    await b.commit();
  }
  await updateDoc(doc(db, 'journeys', id), { route: [], lastPoint: null });
}

export interface LocationPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: number;
  cityId: string | null;
}

/** Persist a batch of filtered GPS points and roll up journey statistics. */
export async function saveLocationBatch(
  j: Pick<Journey, 'id' | 'cityIds' | 'route' | 'anchorCityId'>,
  points: LocationPoint[],
  addedKm: number,
) {
  if (!points.length) return;
  const b = writeBatch(db);
  for (const p of points) b.set(doc(collection(db, 'journeys', j.id, 'locations')), { ...p, excluded: false });
  const newCityIds = Array.from(new Set(points.map((p) => p.cityId).filter((x): x is string => !!x))).filter(
    (c) => !j.cityIds.includes(c),
  );
  const cityIds = [...j.cityIds, ...newCityIds];
  const cities = cityIds.map((id) => CITIES.find((c) => c.id === id)).filter(Boolean);
  const last = points[points.length - 1];
  // Keep a downsampled route on the journey doc (max ~300 points) for fast map rendering.
  let route = [...(j.route ?? []), ...points.map((p) => ({ lat: p.lat, lng: p.lng }))];
  if (route.length > 300) route = route.filter((_, i) => i % 2 === 0 || i === route.length - 1);
  b.update(doc(db, 'journeys', j.id), {
    distanceKm: increment(addedKm),
    lastPoint: { lat: last.lat, lng: last.lng, timestamp: last.timestamp },
    cityIds,
    cities: cities.map((c) => c!.name),
    countries: Array.from(new Set(cities.map((c) => c!.country))),
    continents: Array.from(new Set(cities.map((c) => c!.continent))),
    anchorCityId: j.anchorCityId ?? cityIds[0] ?? null,
    route,
  });
  await b.commit();
}

export async function addActivity(
  journeyId: string,
  a: {
    type: ActivityType;
    title: string;
    caption: string;
    visibility: Visibility;
    mediaUrl?: string | null;
    placeName?: string | null;
    city?: string | null;
    rating?: number | null;
    lat?: number | null;
    lng?: number | null;
    createdAt?: number;
  },
) {
  const data: Omit<Activity, 'id'> = {
    type: a.type,
    title: a.title,
    caption: a.caption,
    mediaUrl: a.mediaUrl ?? null,
    placeName: a.placeName ?? null,
    city: a.city ?? null,
    rating: a.rating ?? null,
    lat: a.lat ?? null,
    lng: a.lng ?? null,
    visibility: a.visibility,
    createdAt: a.createdAt ?? Date.now(),
  };
  const ref = await addDoc(collection(db, 'journeys', journeyId, 'activities'), data);
  if (a.type !== 'start' && a.type !== 'end') {
    const inc: Record<string, unknown> = { activitiesCount: increment(1) };
    if (a.type === 'photo') inc.photos = increment(1);
    if (a.type === 'video') inc.videos = increment(1);
    if (a.type === 'place' || a.type === 'review') inc.placesCount = increment(1);
    if (a.mediaUrl && a.type === 'photo') inc.coverUrl = a.mediaUrl;
    await updateDoc(doc(db, 'journeys', journeyId), inc);
  }
  return ref.id;
}

export async function updateActivity(journeyId: string, id: string, patch: Partial<Pick<Activity, 'title' | 'caption' | 'visibility' | 'rating'>>) {
  await updateDoc(doc(db, 'journeys', journeyId, 'activities', id), patch);
}

export async function deleteActivity(journeyId: string, a: Activity) {
  await deleteDoc(doc(db, 'journeys', journeyId, 'activities', a.id));
  const dec: Record<string, unknown> = { activitiesCount: increment(-1) };
  if (a.type === 'photo') dec.photos = increment(-1);
  if (a.type === 'video') dec.videos = increment(-1);
  if (a.type === 'place' || a.type === 'review') dec.placesCount = increment(-1);
  await updateDoc(doc(db, 'journeys', journeyId), dec);
}

export function subscribeActivities(journeyId: string, cb: (a: Activity[]) => void) {
  const q = query(collection(db, 'journeys', journeyId, 'activities'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => withId<Activity>(d))), () => cb([]));
}

/** Live World presence: opt-in and city-level only — never coordinates. */
export async function setPresence(uid: string, displayName: string, cityId: string | null, active: boolean) {
  const city = CITIES.find((c) => c.id === cityId);
  const ref = doc(db, 'presence', uid);
  if (!active || !city) {
    await deleteDoc(ref).catch(() => {});
    return;
  }
  await setDoc(ref, { city: city.name, cityId: city.id, country: city.country, active: true, displayName, updatedAt: Date.now() });
}

export async function getLiveWorld(): Promise<{ total: number; byCity: { cityId: string; count: number }[] }> {
  const s = await getDocs(query(collection(db, 'presence'), where('active', '==', true), limit(500)));
  const fresh = s.docs.map((d) => d.data()).filter((d) => Date.now() - (d.updatedAt as number) < 6 * 3600_000);
  const counts: Record<string, number> = {};
  fresh.forEach((d) => (counts[d.cityId as string] = (counts[d.cityId as string] ?? 0) + 1));
  return {
    total: fresh.length,
    byCity: Object.entries(counts)
      .map(([cityId, count]) => ({ cityId, count }))
      .sort((a, b) => b.count - a.count),
  };
}
