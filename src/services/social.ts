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
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { findCityByName } from '../data/cities';
import { db } from '../lib/firebase';
import type { Comment, Post, UserProfile, Visibility } from '../types';
import { notify } from './notifications';
import { getBlockedIds, getFollowingIds } from './users';
import { withId } from './util';

export interface NewPost {
  text: string;
  visibility: Visibility;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | null;
  placeName?: string | null;
  city?: string | null;
  groupId?: string | null;
  journeyId?: string | null;
  kind?: Post['kind'];
  rating?: number | null;
}

export async function createPost(me: UserProfile, p: NewPost): Promise<string> {
  const city = findCityByName(p.city);
  const ref = await addDoc(collection(db, 'posts'), {
    authorId: me.uid,
    authorName: me.displayName,
    authorPhoto: me.photoURL ?? null,
    text: p.text.trim(),
    mediaUrl: p.mediaUrl ?? null,
    mediaType: p.mediaType ?? null,
    placeName: p.placeName ?? null,
    city: city?.name ?? p.city ?? null,
    cityId: city?.id ?? null,
    visibility: p.visibility,
    groupId: p.visibility === 'crew' ? (p.groupId ?? null) : (p.groupId ?? null),
    journeyId: p.journeyId ?? null,
    kind: p.kind ?? 'moment',
    rating: p.rating ?? null,
    likesCount: 0,
    commentsCount: 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

const byNewest = (a: Post, b: Post) => (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now());

/**
 * Home feed = public posts + my posts + followers-only posts of people I follow.
 * Each query is shaped so security rules can prove access (AC-007, AC-017).
 */
export async function loadFeed(me: string, max = 40): Promise<Post[]> {
  const [following, blocked] = await Promise.all([getFollowingIds(me), getBlockedIds(me).catch((): string[] => [])]);
  const queries = [
    query(collection(db, 'posts'), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(max)),
    query(collection(db, 'posts'), where('authorId', '==', me), orderBy('createdAt', 'desc'), limit(20)),
    ...following.slice(0, 15).map((uid) =>
      query(collection(db, 'posts'), where('authorId', '==', uid), where('visibility', '==', 'followers'), orderBy('createdAt', 'desc'), limit(10)),
    ),
  ];
  const results = await Promise.allSettled(queries.map((q) => getDocs(q)));
  const map = new Map<string, Post>();
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    r.value.docs.forEach((d) => map.set(d.id, withId<Post>(d)));
  }
  return [...map.values()].filter((p) => !blocked.includes(p.authorId)).sort(byNewest).slice(0, max);
}

export async function loadUserPosts(viewer: string, authorId: string): Promise<Post[]> {
  const qs =
    viewer === authorId
      ? [query(collection(db, 'posts'), where('authorId', '==', authorId), orderBy('createdAt', 'desc'), limit(50))]
      : [
          query(collection(db, 'posts'), where('authorId', '==', authorId), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(50)),
          query(collection(db, 'posts'), where('authorId', '==', authorId), where('visibility', '==', 'followers'), orderBy('createdAt', 'desc'), limit(50)),
        ];
  const res = await Promise.allSettled(qs.map((q) => getDocs(q)));
  const out: Post[] = [];
  res.forEach((r) => r.status === 'fulfilled' && r.value.docs.forEach((d) => out.push(withId<Post>(d))));
  return out.sort(byNewest);
}

export async function loadCityPosts(cityId: string, max = 50): Promise<Post[]> {
  const q = query(collection(db, 'posts'), where('cityId', '==', cityId), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(max));
  const s = await getDocs(q);
  return s.docs.map((d) => withId<Post>(d));
}

export async function loadPublicPosts(max = 100): Promise<Post[]> {
  const q = query(collection(db, 'posts'), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(max));
  const s = await getDocs(q);
  return s.docs.map((d) => withId<Post>(d));
}

export function subscribePost(id: string, cb: (p: Post | null) => void) {
  return onSnapshot(doc(db, 'posts', id), (s) => cb(s.exists() ? withId<Post>(s) : null), () => cb(null));
}

export async function hasLiked(postId: string, uid: string) {
  return (await getDoc(doc(db, 'posts', postId, 'likes', uid))).exists();
}

export async function toggleLike(post: Post, me: UserProfile): Promise<boolean> {
  const likeRef = doc(db, 'posts', post.id, 'likes', me.uid);
  const liked = (await getDoc(likeRef)).exists();
  const b = writeBatch(db);
  if (liked) {
    b.delete(likeRef);
    b.update(doc(db, 'posts', post.id), { likesCount: increment(-1) });
  } else {
    b.set(likeRef, { at: serverTimestamp() });
    b.update(doc(db, 'posts', post.id), { likesCount: increment(1) });
  }
  await b.commit();
  if (!liked) await notify(post.authorId, me, 'like', `${me.displayName} liked your post`, `/post/${post.id}`);
  return !liked;
}

export async function addComment(post: Post, me: UserProfile, text: string) {
  const b = writeBatch(db);
  b.set(doc(collection(db, 'posts', post.id, 'comments')), {
    authorId: me.uid,
    authorName: me.displayName,
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
  b.update(doc(db, 'posts', post.id), { commentsCount: increment(1) });
  await b.commit();
  await notify(post.authorId, me, 'comment', `${me.displayName} commented: “${text.trim().slice(0, 80)}”`, `/post/${post.id}`);
}

export function subscribeComments(postId: string, cb: (c: Comment[]) => void) {
  const q = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt', 'asc'), limit(200));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => withId<Comment>(d))), () => cb([]));
}

export async function deletePost(id: string) {
  await deleteDoc(doc(db, 'posts', id));
}

export async function toggleSave(me: string, postId: string): Promise<boolean> {
  const ref = doc(db, 'users', me, 'saved', postId);
  if ((await getDoc(ref)).exists()) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, { at: serverTimestamp() });
  return true;
}

export async function isSaved(me: string, postId: string) {
  return (await getDoc(doc(db, 'users', me, 'saved', postId))).exists();
}

export async function report(
  me: string,
  targetType: 'post' | 'user' | 'comment' | 'groupActivity',
  targetId: string,
  reason: string,
  targetOwnerId: string | null = null,
) {
  await addDoc(collection(db, 'reports'), {
    targetType,
    targetId,
    targetOwnerId,
    reason,
    reporterId: me,
    status: 'open',
    createdAt: serverTimestamp(),
  });
}

export async function getPost(id: string): Promise<Post | null> {
  try {
    const s = await getDoc(doc(db, 'posts', id));
    return s.exists() ? withId<Post>(s) : null;
  } catch {
    return null;
  }
}

/** Posts the user has saved (bookmarks). Posts they can no longer read are skipped. */
export async function loadSavedPosts(me: string, max = 50): Promise<Post[]> {
  const s = await getDocs(query(collection(db, 'users', me, 'saved'), orderBy('at', 'desc'), limit(max)));
  const posts = await Promise.all(s.docs.map((d) => getPost(d.id)));
  return posts.filter((p): p is Post => !!p);
}

/** Authors may only change text and visibility of their posts (enforced by rules). */
export async function updatePost(id: string, patch: { text?: string; visibility?: Visibility }) {
  const { updateDoc } = await import('firebase/firestore');
  await updateDoc(doc(db, 'posts', id), patch);
}
