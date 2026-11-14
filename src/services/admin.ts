import {
  collection,
  doc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Query,
} from 'firebase/firestore';

import { db } from '../lib/firebase';
import type { Report } from '../types';
import { withId } from './util';

export interface AdminStats {
  users: number;
  posts: number;
  journeys: number;
  groups: number;
  travelVideos: number;
  openReports: number;
}

async function count(q: Query): Promise<number> {
  try {
    return (await getCountFromServer(q)).data().count;
  } catch {
    return -1; // not permitted / unavailable
  }
}

export async function loadAdminStats(): Promise<AdminStats> {
  const [users, posts, journeys, groups, travelVideos, openReports] = await Promise.all([
    count(collection(db, 'users')),
    count(collection(db, 'posts')),
    count(collection(db, 'journeys')),
    count(collection(db, 'groups')),
    count(collection(db, 'travelVideos')),
    count(query(collection(db, 'reports'), where('status', '==', 'open'))),
  ]);
  return { users, posts, journeys, groups, travelVideos, openReports };
}

export async function loadOpenReports(max = 50): Promise<Report[]> {
  const s = await getDocs(query(collection(db, 'reports'), where('status', '==', 'open'), limit(max)));
  return s.docs
    .map((d) => withId<Report>(d))
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
}

export async function resolveReport(id: string, status: 'actioned' | 'dismissed') {
  await updateDoc(doc(db, 'reports', id), { status, resolvedAt: serverTimestamp() });
}

export async function setSuspended(uid: string, suspended: boolean, reason = '') {
  await updateDoc(doc(db, 'users', uid), { suspended, suspendedReason: suspended ? reason || 'Community guidelines violation' : '' });
}

export { orderBy };
