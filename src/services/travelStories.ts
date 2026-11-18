/**
 * Live travel "stories" (WhatsApp-status style) and the full journey sequence shown
 * when a finished journey's feed post is opened.
 *
 * Every query is shaped so the security rules can prove access:
 *  - journeys: public, my own, or followers-only of people I follow (ownerId pinned);
 *  - activities of someone else's journey: only `visibility == 'public'`;
 *  - posts attached to a journey: authorId pinned + public / followers.
 * Equality-only filters, sorted on the device → no extra composite indexes.
 */
import { collection, getDocs, limit, query, where } from 'firebase/firestore';

import { db } from '../lib/firebase';
import { activeDurationMs, formatDurationShort } from '../logic/journey';
import type { Activity, Journey, Post, UserProfile } from '../types';
import { createPost } from './social';
import { getBlockedIds, getFollowingIds, getProfile } from './users';
import { tsToMs, withId } from './util';

const LIVE = ['active', 'paused'] as const;
/** Journeys silent for longer than this are not shown as live stories. */
const STALE_MS = 3 * 24 * 3600_000;

export interface LiveStory {
  journey: Journey;
  ownerPhoto: string | null;
  mine: boolean;
}

function lastActivityAt(j: Journey) {
  return Math.max(j.startedAt, j.lastPoint?.timestamp ?? 0);
}

/** Journeys in progress that I'm allowed to see, mine first, then most recently active. */
export async function loadLiveStories(me: string): Promise<LiveStory[]> {
  const [following, blocked] = await Promise.all([getFollowingIds(me).catch((): string[] => []), getBlockedIds(me).catch((): string[] => [])]);
  const journeys = collection(db, 'journeys');
  const qs = [
    query(journeys, where('ownerId', '==', me), where('status', 'in', [...LIVE]), limit(3)),
    query(journeys, where('visibility', '==', 'public'), where('status', 'in', [...LIVE]), limit(40)),
    ...following
      .slice(0, 20)
      .map((uid) => query(journeys, where('ownerId', '==', uid), where('visibility', '==', 'followers'), where('status', 'in', [...LIVE]), limit(2))),
  ];
  const res = await Promise.allSettled(qs.map((q) => getDocs(q)));
  const map = new Map<string, Journey>();
  for (const r of res) if (r.status === 'fulfilled') r.value.docs.forEach((d) => map.set(d.id, withId<Journey>(d)));

  const now = Date.now();
  const list = [...map.values()].filter((j) => !blocked.includes(j.ownerId) && (j.ownerId === me || now - lastActivityAt(j) < STALE_MS));
  // One story ring per traveller (their newest live journey).
  const byOwner = new Map<string, Journey>();
  for (const j of list) {
    const prev = byOwner.get(j.ownerId);
    if (!prev || j.startedAt > prev.startedAt) byOwner.set(j.ownerId, j);
  }
  const owners = [...byOwner.values()].sort((a, b) => (a.ownerId === me ? -1 : b.ownerId === me ? 1 : lastActivityAt(b) - lastActivityAt(a)));
  const photos = await Promise.all(owners.map((j) => getProfile(j.ownerId).then((p) => p?.photoURL ?? null).catch(() => null)));
  return owners.map((journey, i) => ({ journey, ownerPhoto: photos[i], mine: journey.ownerId === me }));
}

export type MomentKind = 'start' | 'photo' | 'video' | 'place' | 'review' | 'note' | 'end';

export interface Moment {
  id: string;
  kind: MomentKind;
  title: string;
  caption: string;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | null;
  placeName: string | null;
  city: string | null;
  rating: number | null;
  at: number;
}

function fromActivity(a: Activity): Moment {
  return {
    id: `a-${a.id}`,
    kind: a.type,
    title: a.title,
    caption: a.caption,
    mediaUrl: a.mediaUrl,
    mediaType: a.mediaUrl ? (a.type === 'video' ? 'video' : 'image') : null,
    placeName: a.placeName,
    city: a.city,
    rating: a.rating,
    at: a.createdAt,
  };
}

function fromPost(p: Post): Moment {
  const kind: MomentKind = p.mediaType === 'video' ? 'video' : p.mediaUrl ? 'photo' : p.kind === 'review' ? 'review' : p.placeName ? 'place' : 'note';
  return {
    id: `p-${p.id}`,
    kind,
    title: p.placeName ?? (kind === 'note' ? p.text : kind === 'photo' ? 'Photo' : kind === 'video' ? 'Video' : 'Moment'),
    caption: kind === 'note' ? '' : p.text,
    mediaUrl: p.mediaUrl,
    mediaType: p.mediaType,
    placeName: p.placeName,
    city: p.city,
    rating: p.rating,
    at: tsToMs(p.createdAt),
  };
}

/**
 * Everything that happened on a journey, oldest first: start → places, photos, videos,
 * reviews, notes → end. Merges the journey's activities with posts shared from it,
 * de-duplicating the same moment that exists in both.
 */
export async function loadJourneyMoments(j: Journey, viewer: string, viewerFollowsOwner: boolean): Promise<Moment[]> {
  const mine = j.ownerId === viewer;
  const acts = collection(db, 'journeys', j.id, 'activities');
  const posts = collection(db, 'posts');
  const actQ = mine ? query(acts, limit(400)) : query(acts, where('visibility', '==', 'public'), limit(400));
  const postQs = mine
    ? [query(posts, where('authorId', '==', viewer), where('journeyId', '==', j.id), limit(200))]
    : [
        query(posts, where('authorId', '==', j.ownerId), where('journeyId', '==', j.id), where('visibility', '==', 'public'), limit(200)),
        ...(viewerFollowsOwner ? [query(posts, where('authorId', '==', j.ownerId), where('journeyId', '==', j.id), where('visibility', '==', 'followers'), limit(200))] : []),
      ];
  const [actRes, ...postRes] = await Promise.allSettled([getDocs(actQ), ...postQs.map((q) => getDocs(q))]);

  const out: Moment[] = [];
  if (actRes.status === 'fulfilled') {
    actRes.value.docs
      .map((d) => withId<Activity>(d))
      .filter((a) => a.type !== 'start' && a.type !== 'end')
      .forEach((a) => out.push(fromActivity(a)));
  }
  const media = new Set(out.map((m) => m.mediaUrl).filter(Boolean));
  for (const r of postRes) {
    if (r.status !== 'fulfilled') continue;
    for (const d of r.value.docs) {
      const p = withId<Post>(d);
      if (p.kind === 'story' || p.kind === 'video' || p.kind === 'achievement') continue; // summaries, not moments
      if (p.mediaUrl && media.has(p.mediaUrl)) continue;
      const m = fromPost(p);
      // Same text-only moment saved as both an activity and a post (place/review/note composer).
      if (!p.mediaUrl && out.some((o) => !o.mediaUrl && Math.abs(o.at - m.at) < 120_000 && (o.placeName ?? o.title) === (m.placeName ?? m.title))) continue;
      if (p.mediaUrl) media.add(p.mediaUrl);
      out.push(m);
    }
  }
  out.sort((a, b) => a.at - b.at);

  const firstCity = j.cities[0] ?? null;
  const lastCity = j.cities[j.cities.length - 1] ?? null;
  const seq: Moment[] = [
    { id: 'start', kind: 'start', title: 'Journey started', caption: j.title, mediaUrl: null, mediaType: null, placeName: null, city: firstCity, rating: null, at: j.startedAt },
    ...out,
  ];
  if (j.status === 'completed' && j.endedAt) {
    seq.push({
      id: 'end',
      kind: 'end',
      title: 'Journey completed',
      caption: `${j.distanceKm.toFixed(1)} km · ${formatDurationShort(activeDurationMs(j, j.endedAt))}`,
      mediaUrl: null,
      mediaType: null,
      placeName: null,
      city: lastCity,
      rating: null,
      at: j.endedAt,
    });
  }
  return seq;
}

/** Summary line used by the feed post that's created when a journey ends. */
export function journeySummary(j: Journey) {
  const where = j.cities.length ? j.cities.join(' → ') : 'a new adventure';
  return `${j.title}: ${where} · ${j.distanceKm.toFixed(1)} km · ${j.photos + j.videos} memories · ${j.placesCount} places`;
}

/**
 * When a journey ends it moves from the live-story row to the travel feed as a
 * "travel story" post. Private journeys stay private (no post).
 */
export async function postFinishedJourney(me: UserProfile, j: Journey): Promise<string | null> {
  if (j.visibility === 'private') return null;
  if (j.visibility === 'crew' && !j.groupId) return null;
  return createPost(me, {
    text: journeySummary(j),
    visibility: j.visibility,
    city: j.cities[0] ?? null,
    groupId: j.groupId,
    journeyId: j.id,
    mediaUrl: j.coverUrl,
    mediaType: j.coverUrl ? 'image' : null,
    kind: 'story',
  });
}
