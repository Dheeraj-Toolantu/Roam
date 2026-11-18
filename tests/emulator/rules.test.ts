/**
 * Security-rules tests (AC-017 privacy, BR-005..BR-014) against the Firestore emulator.
 * Run with: npm run test:emulator
 */
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { arrayUnion, deleteDoc, doc, getDoc, getDocs, collection, query, serverTimestamp, setDoc, updateDoc, where, Timestamp, increment } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const PROJECT = 'demo-roam-rules';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

function profile(uid: string, extra: Record<string, unknown> = {}) {
  return { uid, displayName: uid, username: uid, visibility: 'public', followersCount: 0, followingCount: 0, ...extra };
}

async function seed(fn: (db: ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore'] extends () => infer R ? R : never) => Promise<void>) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore() as never));
}

const group = (owner: string, members: string[], extra: Record<string, unknown> = {}) => ({
  name: 'Goa Trip 2026',
  ownerId: owner,
  adminIds: [owner],
  memberIds: members,
  memberNames: Object.fromEntries(members.map((m) => [m, m])),
  visibility: 'private',
  inviteCode: 'CODE2345',
  videoExcludedUids: [],
  ...extra,
});

describe('users', () => {
  it('lets a user create their own profile but not forge moderation fields', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'users/alice'), profile('alice')));
    await assertFails(setDoc(doc(as('bob'), 'users/bob'), profile('bob', { suspended: false })));
    await assertFails(setDoc(doc(as('bob'), 'users/bob'), profile('bob', { role: 'admin' })));
    await assertFails(setDoc(doc(as('bob'), 'users/alice'), profile('alice')));
    await assertFails(setDoc(doc(anon(), 'users/x'), profile('x')));
  });

  it('protects private profiles (only owner and followers)', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users/priv'), profile('priv', { visibility: 'private' }));
      await setDoc(doc(db, 'users/priv/followers/fan'), { since: 1 });
    });
    await assertSucceeds(getDoc(doc(as('priv'), 'users/priv')));
    await assertSucceeds(getDoc(doc(as('fan'), 'users/priv')));
    await assertFails(getDoc(doc(as('stranger'), 'users/priv')));
  });

  it('prevents editing someone else and self-unsuspending', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users/alice'), profile('alice', { suspended: true }));
    });
    await assertFails(updateDoc(doc(as('bob'), 'users/alice'), { displayName: 'hacked' }));
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { suspended: false }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'users/alice'), { bio: 'hi' }));
    // follower counters only move by one
    await assertSucceeds(updateDoc(doc(as('bob'), 'users/alice'), { followersCount: increment(1) }));
    await assertFails(updateDoc(doc(as('bob'), 'users/alice'), { followersCount: 999 }));
  });

  it('lets admins suspend users', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users/alice'), profile('alice'));
      await setDoc(doc(db, 'admins/mod'), { since: 1 });
    });
    await assertSucceeds(updateDoc(doc(as('mod'), 'users/alice'), { suspended: true, suspendedReason: 'spam' }));
    await assertFails(updateDoc(doc(as('bob'), 'users/alice'), { suspended: true }));
  });

  it('notifications cannot be forged and are private to the recipient', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'users/alice/notifications/n1'), { type: 'like', fromUid: 'bob', fromName: 'Bob', text: 'hi', read: false }));
    await assertFails(setDoc(doc(as('bob'), 'users/alice/notifications/n2'), { type: 'like', fromUid: 'carol', fromName: 'C', text: 'hi', read: false }));
    await assertSucceeds(getDoc(doc(as('alice'), 'users/alice/notifications/n1')));
    await assertFails(getDoc(doc(as('bob'), 'users/alice/notifications/n1')));
  });
});

describe('journeys & location privacy (BRD §5.4, BR-006, BR-014)', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'journeys/pub'), { ownerId: 'alice', status: 'completed', type: 'solo', visibility: 'public' });
      await setDoc(doc(db, 'journeys/priv'), { ownerId: 'alice', status: 'active', type: 'solo', visibility: 'private' });
      await setDoc(doc(db, 'journeys/pub/locations/l1'), { lat: 15.5, lng: 73.8 });
      await setDoc(doc(db, 'groups/g1'), group('alice', ['alice', 'bob']));
      await setDoc(doc(db, 'journeys/crew'), { ownerId: 'alice', status: 'active', type: 'group', groupId: 'g1', visibility: 'crew' });
    });
  });

  it('private journeys are owner-only', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'journeys/priv')));
    await assertFails(getDoc(doc(as('bob'), 'journeys/priv')));
  });

  it('precise GPS history stays owner-only even on a public journey', async () => {
    await assertSucceeds(getDoc(doc(as('bob'), 'journeys/pub')));
    await assertFails(getDoc(doc(as('bob'), 'journeys/pub/locations/l1')));
    await assertSucceeds(getDoc(doc(as('alice'), 'journeys/pub/locations/l1')));
  });

  it('crew journeys are visible to crew members only', async () => {
    await assertSucceeds(getDoc(doc(as('bob'), 'journeys/crew')));
    await assertFails(getDoc(doc(as('eve'), 'journeys/crew')));
    await assertSucceeds(getDocs(query(collection(as('bob'), 'journeys'), where('groupId', '==', 'g1'), where('visibility', '==', 'crew'))));
  });

  it('trip moments reach exactly the trip audience: public, followers, crew; private stays owner-only', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'journeys/fol'), { ownerId: 'alice', status: 'active', type: 'solo', visibility: 'followers' });
      await setDoc(doc(db, 'users/alice/followers/fan'), { since: 1 });
      await setDoc(doc(db, 'journeys/fol/activities/a1'), { type: 'video', visibility: 'followers', mediaUrl: 'x', thumbUrl: 'y', createdAt: 1 });
      await setDoc(doc(db, 'journeys/crew/activities/c1'), { type: 'photo', visibility: 'crew', createdAt: 1 });
      await setDoc(doc(db, 'journeys/priv/activities/p1'), { type: 'photo', visibility: 'private', createdAt: 1 });
    });
    const acts = (who: string, jid: string, vis: string) => getDocs(query(collection(as(who), 'journeys', jid, 'activities'), where('visibility', '==', vis)));
    await assertSucceeds(acts('fan', 'fol', 'followers'));
    await assertFails(acts('eve', 'fol', 'followers'));
    await assertSucceeds(acts('bob', 'crew', 'crew'));
    await assertFails(acts('eve', 'crew', 'crew'));
    await assertFails(getDoc(doc(as('fan'), 'journeys/priv/activities/p1')));
    await assertSucceeds(getDoc(doc(as('alice'), 'journeys/priv/activities/p1')));
  });

  it('a user can only create journeys for themselves', async () => {
    const j = { ownerId: 'bob', status: 'active', type: 'solo', visibility: 'private' };
    await assertSucceeds(setDoc(doc(as('bob'), 'journeys/j2'), j));
    await assertFails(setDoc(doc(as('eve'), 'journeys/j3'), j));
    await assertFails(setDoc(doc(as('eve'), 'journeys/j4'), { ...j, ownerId: 'eve', type: 'group', groupId: 'g1' }));
  });

  it('Live World presence never accepts coordinates', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'presence/bob'), { city: 'Goa', cityId: 'goa', country: 'India', active: true, displayName: 'Bob', updatedAt: 1 }));
    await assertFails(setDoc(doc(as('bob'), 'presence/bob'), { city: 'Goa', cityId: 'goa', active: true, lat: 15.5, lng: 73.8, updatedAt: 1 }));
    await assertFails(setDoc(doc(as('bob'), 'presence/alice'), { city: 'Goa', cityId: 'goa', active: true, updatedAt: 1 }));
  });
});

describe('posts & visibility (AC-007)', () => {
  const post = (authorId: string, visibility: string, extra: Record<string, unknown> = {}) => ({
    authorId, authorName: authorId, text: 'Sunset at Baga', visibility, likesCount: 0, commentsCount: 0, createdAt: serverTimestamp(), ...extra,
  });

  it('enforces author identity and initial counters', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'posts/p1'), post('alice', 'public')));
    await assertFails(setDoc(doc(as('alice'), 'posts/p2'), post('bob', 'public')));
    await assertFails(setDoc(doc(as('alice'), 'posts/p3'), post('alice', 'public', { likesCount: 100 })));
    await assertFails(setDoc(doc(as('alice'), 'posts/p4'), post('alice', 'public', { createdAt: Timestamp.fromMillis(0) })));
  });

  it('followers-only posts are hidden from non-followers', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'posts/f1'), { ...post('alice', 'followers'), createdAt: Timestamp.now() });
      await setDoc(doc(db, 'users/alice/followers/fan'), { since: 1 });
    });
    await assertSucceeds(getDoc(doc(as('fan'), 'posts/f1')));
    await assertFails(getDoc(doc(as('eve'), 'posts/f1')));
    await assertSucceeds(getDocs(query(collection(as('fan'), 'posts'), where('authorId', '==', 'alice'), where('visibility', '==', 'followers'))));
    await assertFails(getDocs(query(collection(as('eve'), 'posts'), where('authorId', '==', 'alice'), where('visibility', '==', 'followers'))));
    await assertSucceeds(getDocs(query(collection(as('eve'), 'posts'), where('visibility', '==', 'public'))));
  });

  it('joining a crew does not expose crew posts to outsiders, and only members can post to a crew (§9.2)', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'groups/g1'), group('alice', ['alice', 'bob']));
    });
    await assertSucceeds(setDoc(doc(as('bob'), 'posts/c1'), post('bob', 'crew', { groupId: 'g1' })));
    await assertFails(setDoc(doc(as('eve'), 'posts/c2'), post('eve', 'crew', { groupId: 'g1' })));
    await assertSucceeds(getDoc(doc(as('alice'), 'posts/c1')));
    await assertFails(getDoc(doc(as('eve'), 'posts/c1')));
  });

  it('likes change the counter by exactly one; only admins can read reports', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'posts/p1'), { ...post('alice', 'public'), createdAt: Timestamp.now() });
      await setDoc(doc(db, 'admins/mod'), { since: 1 });
    });
    await assertSucceeds(updateDoc(doc(as('bob'), 'posts/p1'), { likesCount: increment(1) }));
    await assertFails(updateDoc(doc(as('bob'), 'posts/p1'), { likesCount: 50 }));
    await assertFails(updateDoc(doc(as('bob'), 'posts/p1'), { text: 'edited by bob' }));
    await assertSucceeds(setDoc(doc(as('bob'), 'reports/r1'), { targetType: 'post', targetId: 'p1', reporterId: 'bob', reason: 'spam', status: 'open' }));
    await assertFails(getDoc(doc(as('bob'), 'reports/r1')));
    await assertSucceeds(getDoc(doc(as('mod'), 'reports/r1')));
    await assertSucceeds(deleteDoc(doc(as('mod'), 'posts/p1')));
  });

  it('the post audience can list likers; likes carry only name/photo; private posts stay private', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'posts/pub'), { ...post('alice', 'public'), createdAt: Timestamp.now() });
      await setDoc(doc(db, 'posts/priv'), { ...post('alice', 'private'), createdAt: Timestamp.now() });
    });
    await assertSucceeds(setDoc(doc(as('bob'), 'posts/pub/likes/bob'), { at: serverTimestamp(), name: 'Bob', username: 'bob', photoURL: null }));
    await assertFails(setDoc(doc(as('bob'), 'posts/pub/likes/carol'), { at: serverTimestamp(), name: 'Carol' }));
    await assertFails(setDoc(doc(as('carol'), 'posts/pub/likes/carol'), { at: serverTimestamp(), name: 'Carol', isAdmin: true }));
    await assertFails(setDoc(doc(as('carol'), 'posts/pub/likes/carol'), { at: serverTimestamp(), name: 'x'.repeat(200) }));
    await assertSucceeds(setDoc(doc(as('carol'), 'posts/pub/likes/carol'), { at: serverTimestamp() }));
    await assertSucceeds(getDocs(collection(as('alice'), 'posts/pub/likes')));
    await assertSucceeds(getDocs(collection(as('eve'), 'posts/pub/likes')));
    await assertSucceeds(getDocs(collection(as('alice'), 'posts/priv/likes')));
    await assertFails(getDocs(collection(as('eve'), 'posts/priv/likes')));
  });

});

describe('ROAM CREW membership (BR-004, BR-005, BR-007)', () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'groups/g1'), group('alice', ['alice', 'bob']));
      await setDoc(doc(db, 'groupCodes/CODE2345'), { groupId: 'g1' });
      await setDoc(doc(db, 'groups/g1/timeline/t1'), { authorId: 'alice', text: 'Baga Beach', commentsCount: 0 });
    });
  });

  it('only members can read the group and its timeline', async () => {
    await assertSucceeds(getDoc(doc(as('bob'), 'groups/g1')));
    await assertSucceeds(getDoc(doc(as('bob'), 'groups/g1/timeline/t1')));
    await assertFails(getDoc(doc(as('eve'), 'groups/g1')));
    await assertFails(getDoc(doc(as('eve'), 'groups/g1/timeline/t1')));
  });

  it('a new group must start with only the creator', async () => {
    await assertSucceeds(setDoc(doc(as('carol'), 'groups/g2'), group('carol', ['carol'])));
    await assertFails(setDoc(doc(as('carol'), 'groups/g3'), group('carol', ['carol', 'dave'])));
  });

  it('strangers cannot join without an invite or valid code', async () => {
    await assertFails(updateDoc(doc(as('eve'), 'groups/g1'), { memberIds: arrayUnion('eve'), 'memberNames.eve': 'Eve' }));
    await assertFails(updateDoc(doc(as('eve'), 'groups/g1'), { memberIds: arrayUnion('eve'), joinCode: 'WRONG123' }));
  });

  it('invited users and code holders can add only themselves', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'invitations/g1_carol'), { groupId: 'g1', toUid: 'carol', fromUid: 'alice', status: 'pending' });
    });
    await assertSucceeds(updateDoc(doc(as('carol'), 'groups/g1'), { memberIds: arrayUnion('carol'), 'memberNames.carol': 'Carol' }));
    await assertFails(updateDoc(doc(as('dave'), 'groups/g1'), { memberIds: arrayUnion('dave', 'mallory'), joinCode: 'CODE2345' }));
    await assertSucceeds(updateDoc(doc(as('dave'), 'groups/g1'), { memberIds: arrayUnion('dave'), 'memberNames.dave': 'Dave', joinCode: 'CODE2345' }));
  });

  it('invitations: deterministic ids, only the invitee responds', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'invitations/g1_carol'), { groupId: 'g1', toUid: 'carol', fromUid: 'bob', status: 'pending' }));
    await assertFails(setDoc(doc(as('bob'), 'invitations/random'), { groupId: 'g1', toUid: 'dave', fromUid: 'bob', status: 'pending' }));
    await assertFails(setDoc(doc(as('eve'), 'invitations/g1_eve'), { groupId: 'g1', toUid: 'eve', fromUid: 'eve', status: 'pending' }));
    await assertFails(updateDoc(doc(as('bob'), 'invitations/g1_carol'), { status: 'accepted' }));
    await assertSucceeds(updateDoc(doc(as('carol'), 'invitations/g1_carol'), { status: 'rejected' }));
  });

  it('members can leave but owners cannot be removed', async () => {
    await assertSucceeds(updateDoc(doc(as('bob'), 'groups/g1'), { memberIds: ['alice'] }));
    await seed(async (db) => {
      await setDoc(doc(db, 'groups/g2'), group('alice', ['alice', 'bob'], { adminIds: ['alice', 'bob'] }));
    });
    await assertFails(updateDoc(doc(as('bob'), 'groups/g2'), { memberIds: ['bob'], adminIds: ['bob'] }));
  });

  it('members toggle only their own video opt-out (BR-013)', async () => {
    await assertSucceeds(updateDoc(doc(as('bob'), 'groups/g1'), { videoExcludedUids: ['bob'] }));
    await assertFails(updateDoc(doc(as('bob'), 'groups/g1'), { videoExcludedUids: ['bob', 'alice'] }));
  });
});

describe('ROAM SPLIT (BR-008..BR-012)', () => {
  const expense = (extra: Record<string, unknown> = {}) => ({
    title: 'Dinner @ Thalassa',
    amount: 250000,
    payerId: 'alice',
    participants: { alice: 125000, bob: 125000 },
    splitMethod: 'equal',
    personal: false,
    category: 'food',
    createdBy: 'alice',
    status: 'active',
    validation: 'pending',
    ...extra,
  });

  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'groups/g1'), group('alice', ['alice', 'bob']));
      await setDoc(doc(db, 'groups/g1/expenses/e0'), expense());
      await setDoc(doc(db, 'groups/g1/settlements/s0'), { fromUid: 'bob', toUid: 'alice', amount: 125000, status: 'recorded', recordedBy: 'bob' });
    });
  });

  it('members add valid expenses; outsiders cannot', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'groups/g1/expenses/e1'), expense()));
    await assertFails(setDoc(doc(as('eve'), 'groups/g1/expenses/e2'), expense({ createdBy: 'eve' })));
    await assertFails(getDoc(doc(as('eve'), 'groups/g1/expenses/e0')));
  });

  it('rejects invalid payers, participants, amounts and forged validation', async () => {
    await assertFails(setDoc(doc(as('alice'), 'groups/g1/expenses/x1'), expense({ payerId: 'eve' })));
    await assertFails(setDoc(doc(as('alice'), 'groups/g1/expenses/x2'), expense({ participants: { alice: 125000, eve: 125000 } })));
    await assertFails(setDoc(doc(as('alice'), 'groups/g1/expenses/x3'), expense({ amount: -5 })));
    await assertFails(setDoc(doc(as('alice'), 'groups/g1/expenses/x4'), expense({ amount: 10.5 })));
    await assertFails(setDoc(doc(as('alice'), 'groups/g1/expenses/x5'), expense({ validation: 'ok' })));
    await assertFails(setDoc(doc(as('alice'), 'groups/g1/expenses/x6'), expense({ createdBy: 'bob' })));
    // personal expenses belong to the payer only
    await assertFails(setDoc(doc(as('alice'), 'groups/g1/expenses/x7'), expense({ personal: true, splitMethod: 'personal', participants: { bob: 250000 } })));
    await assertSucceeds(setDoc(doc(as('alice'), 'groups/g1/expenses/x8'), expense({ personal: true, splitMethod: 'personal', participants: { alice: 250000 } })));
  });

  it('expenses are never hard-deleted; only creator/admin edits', async () => {
    await assertFails(deleteDoc(doc(as('alice'), 'groups/g1/expenses/e0')));
    await assertFails(updateDoc(doc(as('bob'), 'groups/g1/expenses/e0'), { title: 'changed' }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'groups/g1/expenses/e0'), { status: 'deleted', validation: 'pending' }));
  });

  it('settlements: either party records, only the receiver confirms (record ≠ verify)', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'groups/g1/settlements/s1'), { fromUid: 'bob', toUid: 'alice', amount: 100, status: 'recorded', recordedBy: 'bob' }));
    await assertFails(setDoc(doc(as('bob'), 'groups/g1/settlements/s2'), { fromUid: 'bob', toUid: 'alice', amount: 100, status: 'confirmed', recordedBy: 'bob' }));
    await assertFails(setDoc(doc(as('carol'), 'groups/g1/settlements/s3'), { fromUid: 'bob', toUid: 'alice', amount: 100, status: 'recorded', recordedBy: 'carol' }));
    await assertFails(updateDoc(doc(as('bob'), 'groups/g1/settlements/s0'), { status: 'confirmed', confirmedBy: 'bob' }));
    await assertSucceeds(updateDoc(doc(as('alice'), 'groups/g1/settlements/s0'), { status: 'confirmed', confirmedBy: 'alice' }));
    await assertFails(deleteDoc(doc(as('alice'), 'groups/g1/settlements/s0')));
  });

  it('audit log and balances are server-only', async () => {
    await assertFails(setDoc(doc(as('alice'), 'groups/g1/audit/a1'), { text: 'fake' }));
    await assertFails(setDoc(doc(as('alice'), 'groups/g1/meta/balances'), { balances: {} }));
  });
});

describe('crew live location (BR-006: opt-in, members only)', () => {
  const live = (uid: string, extra: Record<string, unknown> = {}) => ({ uid, name: uid, lat: 15.5553, lng: 73.7517, accuracy: 12, updatedAt: Date.now(), ...extra });
  beforeEach(async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'groups/g1'), group('alice', ['alice', 'bob']));
    });
  });

  it('members share their own live location; others in the crew can read it', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'groups/g1/live/bob'), live('bob')));
    await assertSucceeds(getDoc(doc(as('alice'), 'groups/g1/live/bob')));
    await assertSucceeds(getDocs(collection(as('alice'), 'groups/g1/live')));
  });

  it('non-members can neither read nor publish live locations', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'groups/g1/live/bob'), live('bob'));
    });
    await assertFails(getDoc(doc(as('eve'), 'groups/g1/live/bob')));
    await assertFails(getDocs(collection(as('eve'), 'groups/g1/live')));
    await assertFails(setDoc(doc(as('eve'), 'groups/g1/live/eve'), live('eve')));
  });

  it('nobody can publish a location for someone else or add extra fields', async () => {
    await assertFails(setDoc(doc(as('bob'), 'groups/g1/live/alice'), live('alice')));
    await assertFails(setDoc(doc(as('bob'), 'groups/g1/live/bob'), live('bob', { address: '12 Beach Rd' })));
    await assertFails(setDoc(doc(as('bob'), 'groups/g1/live/bob'), live('bob', { lat: 123 })));
  });

  it('users can always stop sharing; others cannot delete it (except admins)', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'groups/g1/live/bob'), live('bob'));
      await setDoc(doc(db, 'groups/g1/live/carol'), live('carol'));
    });
    await assertSucceeds(deleteDoc(doc(as('bob'), 'groups/g1/live/bob')));
    await assertFails(deleteDoc(doc(as('eve'), 'groups/g1/live/carol')));
    await assertSucceeds(deleteDoc(doc(as('alice'), 'groups/g1/live/carol'))); // admin clears stale entry
  });
});
