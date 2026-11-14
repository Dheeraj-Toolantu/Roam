import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { findCityByName } from '../data/cities';
import { db } from '../lib/firebase';
import type { Comment, Group, Invitation, TimelineItem, UserProfile } from '../types';
import { notify, notifyMany } from './notifications';
import { findByUsername } from './users';
import { randomCode, withId } from './util';

const PALETTES: [string, string][] = [
  ['#F97316', '#DB2777'], ['#22D3EE', '#8B5CF6'], ['#10B981', '#0EA5E9'], ['#F59E0B', '#EF4444'], ['#6366F1', '#EC4899'],
];

export async function createGroup(
  me: UserProfile,
  g: { name: string; destination: string; description: string; startDate: string; endDate: string; visibility: 'private' | 'public'; budget: number },
): Promise<string> {
  if (!g.name.trim()) throw new Error('Give your trip a name');
  if (g.startDate && g.endDate && g.endDate < g.startDate) throw new Error('End date must be after the start date');
  const city = findCityByName(g.destination);
  const ref = doc(collection(db, 'groups'));
  const code = randomCode(8);
  const data: Omit<Group, 'id'> = {
    name: g.name.trim(),
    destination: city?.name ?? g.destination.trim(),
    destinationCityId: city?.id ?? null,
    description: g.description.trim(),
    startDate: g.startDate,
    endDate: g.endDate,
    visibility: g.visibility,
    ownerId: me.uid,
    adminIds: [me.uid],
    memberIds: [me.uid],
    memberNames: { [me.uid]: me.displayName },
    budget: g.budget,
    budgetAlertPct: 80,
    currency: 'INR',
    inviteCode: code,
    videoExcludedUids: [],
    colors: city?.colors ?? PALETTES[Math.floor(Math.random() * PALETTES.length)],
    createdAt: null,
  };
  await setDoc(ref, { ...data, createdAt: serverTimestamp() });
  await setDoc(doc(db, 'groupCodes', code), { groupId: ref.id });
  return ref.id;
}

export function subscribeGroup(id: string, cb: (g: Group | null) => void) {
  return onSnapshot(doc(db, 'groups', id), (s) => cb(s.exists() ? withId<Group>(s) : null), () => cb(null));
}

export function subscribeMyGroups(uid: string, cb: (g: Group[]) => void) {
  const q = query(collection(db, 'groups'), where('memberIds', 'array-contains', uid), limit(100));
  return onSnapshot(
    q,
    (s) =>
      cb(
        s.docs
          .map((d) => withId<Group>(d))
          .sort((a, b) => (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now())),
      ),
    () => cb([]),
  );
}

export function subscribeMyInvites(uid: string, cb: (i: Invitation[]) => void) {
  const q = query(collection(db, 'invitations'), where('toUid', '==', uid), where('status', '==', 'pending'));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => withId<Invitation>(d))), () => cb([]));
}

export function subscribeGroupInvites(groupId: string, cb: (i: Invitation[]) => void) {
  const q = query(collection(db, 'invitations'), where('groupId', '==', groupId));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => withId<Invitation>(d))), () => cb([]));
}

/** Invite by ROAM username (BRD 11.3). */
export async function inviteByUsername(me: UserProfile, group: Group, username: string) {
  const target = await findByUsername(username);
  if (!target) throw new Error(`No traveller found with username @${username.replace(/^@/, '')}`);
  if (group.memberIds.includes(target.uid)) throw new Error(`${target.displayName} is already in this crew`);
  const id = `${group.id}_${target.uid}`;
  const existing = await getDoc(doc(db, 'invitations', id)).catch(() => null);
  if (existing?.exists() && existing.data().status === 'pending') throw new Error(`${target.displayName} already has a pending invite`);
  await setDoc(doc(db, 'invitations', id), {
    groupId: group.id,
    groupName: group.name,
    destination: group.destination,
    fromUid: me.uid,
    fromName: me.displayName,
    toUid: target.uid,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  await notify(target.uid, me, 'invite', `${me.displayName} invited you to join “${group.name}”`, '/crew');
  return target;
}

export async function respondToInvite(me: UserProfile, inv: Invitation, accept: boolean) {
  if (accept) {
    // Accept first so the group rule can see an accepted/pending invitation.
    await updateDoc(doc(db, 'groups', inv.groupId), {
      memberIds: arrayUnion(me.uid),
      [`memberNames.${me.uid}`]: me.displayName,
      updatedAt: serverTimestamp(),
    });
  }
  await updateDoc(doc(db, 'invitations', inv.id), { status: accept ? 'accepted' : 'rejected', respondedAt: serverTimestamp() });
  if (accept) {
    await notify(inv.fromUid, me, 'inviteAccepted', `${me.displayName} joined “${inv.groupName}”`, `/trip/${inv.groupId}`);
    await addTimelineItem(inv.groupId, me, { type: 'join', text: `${me.displayName} joined the crew` }).catch(() => {});
  }
}

/** Join via invitation link / QR code. */
export async function joinWithCode(me: UserProfile, rawCode: string): Promise<string> {
  const code = rawCode.trim().toUpperCase().replace(/^.*[/=]/, '');
  const snap = await getDoc(doc(db, 'groupCodes', code)).catch(() => null);
  if (!snap?.exists()) throw new Error('That invite code is not valid');
  const groupId = snap.data().groupId as string;
  await updateDoc(doc(db, 'groups', groupId), {
    memberIds: arrayUnion(me.uid),
    [`memberNames.${me.uid}`]: me.displayName,
    joinCode: code,
    updatedAt: serverTimestamp(),
  });
  await addTimelineItem(groupId, me, { type: 'join', text: `${me.displayName} joined the crew` }).catch(() => {});
  return groupId;
}

export function inviteLink(group: Pick<Group, 'inviteCode'>) {
  return `https://roam.app/join/${group.inviteCode}`;
}

export async function leaveGroup(me: string, group: Group) {
  if (group.ownerId === me) throw new Error('The trip owner cannot leave. Transfer ownership or delete the trip.');
  // Stop live location sharing with this crew before losing access
  const { liveShare } = await import('./liveShare');
  await liveShare.disable(group.id).catch(() => {});
  // Financial records are retained (BR-012); member name stays for history.
  await updateDoc(doc(db, 'groups', group.id), {
    memberIds: arrayRemove(me),
    adminIds: arrayRemove(me),
    updatedAt: serverTimestamp(),
  });
}

export async function removeMember(group: Group, uid: string) {
  if (uid === group.ownerId) throw new Error('The owner cannot be removed');
  await updateDoc(doc(db, 'groups', group.id), {
    memberIds: arrayRemove(uid),
    adminIds: arrayRemove(uid),
    updatedAt: serverTimestamp(),
  });
}

export async function setAdmin(group: Group, uid: string, makeAdmin: boolean) {
  await updateDoc(doc(db, 'groups', group.id), { adminIds: makeAdmin ? arrayUnion(uid) : arrayRemove(uid) });
}

export async function updateGroup(id: string, patch: Partial<Pick<Group, 'name' | 'description' | 'startDate' | 'endDate' | 'budget' | 'budgetAlertPct' | 'visibility'>>) {
  await updateDoc(doc(db, 'groups', id), { ...patch, updatedAt: serverTimestamp() });
}

export async function setVideoExcluded(group: Group, uid: string, excluded: boolean) {
  await updateDoc(doc(db, 'groups', group.id), {
    videoExcludedUids: excluded ? arrayUnion(uid) : arrayRemove(uid),
  });
}

export async function addTimelineItem(
  groupId: string,
  me: Pick<UserProfile, 'uid' | 'displayName'>,
  item: { type: TimelineItem['type']; text: string; mediaUrl?: string | null; placeName?: string | null },
  notifyMembers?: { memberIds: string[]; groupName: string },
) {
  await addDoc(collection(db, 'groups', groupId, 'timeline'), {
    authorId: me.uid,
    authorName: me.displayName,
    type: item.type,
    text: item.text,
    mediaUrl: item.mediaUrl ?? null,
    placeName: item.placeName ?? null,
    commentsCount: 0,
    createdAt: serverTimestamp(),
  });
  if (notifyMembers) {
    await notifyMany(
      notifyMembers.memberIds,
      me,
      'groupActivity',
      `${me.displayName} shared ${item.type === 'photo' ? 'a photo' : item.type === 'video' ? 'a video' : 'a moment'} in ${notifyMembers.groupName}`,
      `/trip/${groupId}`,
    );
  }
}

export function subscribeTimeline(groupId: string, cb: (t: TimelineItem[]) => void) {
  const q = query(collection(db, 'groups', groupId, 'timeline'), orderBy('createdAt', 'asc'), limit(500));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => withId<TimelineItem>(d))), () => cb([]));
}

export async function deleteTimelineItem(groupId: string, id: string) {
  const b = writeBatch(db);
  b.delete(doc(db, 'groups', groupId, 'timeline', id));
  await b.commit();
}

export async function addTimelineComment(groupId: string, itemId: string, me: UserProfile, text: string) {
  const b = writeBatch(db);
  b.set(doc(collection(db, 'groups', groupId, 'timeline', itemId, 'comments')), {
    authorId: me.uid,
    authorName: me.displayName,
    text: text.trim(),
    createdAt: serverTimestamp(),
  });
  b.update(doc(db, 'groups', groupId, 'timeline', itemId), { commentsCount: increment(1) });
  await b.commit();
}

export function subscribeTimelineComments(groupId: string, itemId: string, cb: (c: Comment[]) => void) {
  const q = query(collection(db, 'groups', groupId, 'timeline', itemId, 'comments'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => withId<Comment>(d))), () => cb([]));
}

export { deleteField };

/** Member journeys explicitly shared with this crew (visibility 'crew'). Precise GPS stays owner-only. */
export function subscribeGroupJourneys(groupId: string, cb: (j: import('../types').Journey[]) => void) {
  const q = query(collection(db, 'journeys'), where('groupId', '==', groupId), where('visibility', '==', 'crew'), limit(50));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => withId<import('../types').Journey>(d))), () => cb([]));
}
