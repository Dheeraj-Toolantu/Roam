import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '../lib/firebase';
import type { AppNotification, NotificationType } from '../types';
import { withId } from './util';

type Sender = { uid: string; displayName: string };

/**
 * Send an in-app notification. Delivery preferences are applied by the
 * recipient's client (notifications they have switched off are hidden),
 * so senders never need to read another user's private settings.
 */
export async function notify(toUid: string, from: Sender, type: NotificationType, text: string, link: string | null = null) {
  if (toUid === from.uid) return;
  try {
    await addDoc(collection(db, 'users', toUid, 'notifications'), {
      type,
      fromUid: from.uid,
      fromName: from.displayName,
      text: text.slice(0, 280),
      link,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    // Notifications are best-effort and must never block the main action.
    console.warn('notify failed', e);
  }
}

export async function notifyMany(toUids: string[], from: Sender, type: NotificationType, text: string, link: string | null = null) {
  await Promise.all(toUids.filter((u) => u !== from.uid).map((u) => notify(u, from, type, text, link)));
}

export function subscribeNotifications(uid: string, cb: (n: AppNotification[]) => void) {
  const q = query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(100));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => withId<AppNotification>(d))), () => cb([]));
}

export async function markRead(uid: string, id: string) {
  await updateDoc(doc(db, 'users', uid, 'notifications', id), { read: true });
}

export async function markAllRead(uid: string, items: AppNotification[]) {
  const unread = items.filter((n) => !n.read);
  if (!unread.length) return;
  const b = writeBatch(db);
  unread.forEach((n) => b.update(doc(db, 'users', uid, 'notifications', n.id), { read: true }));
  await b.commit();
}
