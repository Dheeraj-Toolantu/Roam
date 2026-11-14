/**
 * Integration test: client SDK -> Firestore emulator -> Cloud Functions emulator.
 * Verifies server-side expense validation, audit log and balance computation
 * using the BRD §12.4 worked example (AC-013, AC-014, AC-015).
 */
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getDocs, collection, initializeFirestore, serverTimestamp, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { allocate } from '../../src/logic/split';

const PROJECT = 'demo-roam';
const people = ['dheeraj', 'priya', 'rahul', 'amit', 'neha'] as const;
type Person = (typeof people)[number];
const apps: FirebaseApp[] = [];
const dbs = {} as Record<Person, Firestore>;
const uids = {} as Record<Person, string>;
const r = (n: number) => n * 100;
const run = Date.now().toString(36);

async function client(name: Person) {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT, authDomain: 'demo-roam.firebaseapp.com' }, `${name}-${run}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = initializeFirestore(app, {});
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const cred = await createUserWithEmailAndPassword(auth, `${name}.${run}@roam.test`, 'password123');
  dbs[name] = db;
  uids[name] = cred.user.uid;
}

async function waitFor<T>(fn: () => Promise<T | undefined | null | false>, ms = 20_000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const v = await fn();
    if (v) return v;
    await new Promise((res) => setTimeout(res, 300));
  }
  throw new Error('timed out waiting for Cloud Function');
}

const gid = `goa-${run}`;

beforeAll(async () => {
  for (const p of people) await client(p);
  const members = people.map((p) => uids[p]);
  // Dheeraj creates the trip, then everyone else joins with the invite code.
  await setDoc(doc(dbs.dheeraj, 'groups', gid), {
    name: 'Goa Trip 2026',
    ownerId: uids.dheeraj,
    adminIds: [uids.dheeraj],
    memberIds: [uids.dheeraj],
    memberNames: { [uids.dheeraj]: 'Dheeraj' },
    visibility: 'private',
    inviteCode: `C${run}`.toUpperCase(),
    videoExcludedUids: [],
    budget: r(16000),
    budgetAlertPct: 80,
  });
  await setDoc(doc(dbs.dheeraj, 'groupCodes', `C${run}`.toUpperCase()), { groupId: gid });
  for (const p of people.slice(1)) {
    const g = (await getDoc(doc(dbs[p], 'groupCodes', `C${run}`.toUpperCase()))).data()!;
    expect(g.groupId).toBe(gid);
    const { arrayUnion } = await import('firebase/firestore');
    await updateDoc(doc(dbs[p], 'groups', gid), {
      memberIds: arrayUnion(uids[p]),
      [`memberNames.${uids[p]}`]: p[0].toUpperCase() + p.slice(1),
      joinCode: `C${run}`.toUpperCase(),
    });
  }
  const snap = await getDoc(doc(dbs.dheeraj, 'groups', gid));
  expect(snap.data()!.memberIds.sort()).toEqual([...members].sort());
});

afterAll(async () => {
  await Promise.all(apps.map((a) => deleteApp(a)));
});

describe('ROAM SPLIT server-side processing', () => {
  it('validates expenses and computes the BRD example balances', async () => {
    const members = people.map((p) => uids[p]);
    const paid: [Person, number][] = [
      ['dheeraj', 5000],
      ['priya', 2500],
      ['rahul', 3000],
      ['amit', 1500],
      ['neha', 3000],
    ];
    for (const [p, amt] of paid) {
      await setDoc(doc(dbs[p], 'groups', gid, 'expenses', `e-${p}`), {
        title: `Expense by ${p}`,
        amount: r(amt),
        payerId: uids[p],
        participants: allocate(r(amt), 'equal', members),
        splitMethod: 'equal',
        personal: false,
        category: 'food',
        notes: '',
        date: '2026-11-20',
        createdBy: uids[p],
        status: 'active',
        validation: 'pending',
        createdAt: serverTimestamp(),
      });
    }
    for (const [p] of paid) {
      const v = await waitFor(async () => {
        const d = (await getDoc(doc(dbs.dheeraj, 'groups', gid, 'expenses', `e-${p}`))).data();
        return d && d.validation !== 'pending' ? d.validation : null;
      });
      expect(v).toBe('ok');
    }
    const meta = await waitFor(async () => {
      const d = (await getDoc(doc(dbs.dheeraj, 'groups', gid, 'meta', 'balances'))).data();
      return d && d.total === r(15000) ? d : null;
    });
    expect(meta.balances[uids.dheeraj].balance).toBe(r(2000));
    expect(meta.balances[uids.priya].balance).toBe(r(-500));
    expect(meta.balances[uids.amit].balance).toBe(r(-1500));
    expect(meta.suggestions).toHaveLength(2);
    expect(meta.budgetLevel).toBe('warning'); // 15000 / 16000 = 94% > 80%
  });

  it('sends a budget alert notification to members', async () => {
    const notes = await waitFor(async () => {
      const s = await getDocs(collection(dbs.neha, 'users', uids.neha, 'notifications'));
      const b = s.docs.map((d) => d.data()).filter((n) => n.type === 'budget');
      return b.length ? b : null;
    });
    expect(notes[0].text).toMatch(/budget/);
  });

  it('marks an expense whose allocations do not add up as invalid (BR-009)', async () => {
    // Rules can't sum a map, so this write is accepted by rules — the function must catch it.
    await setDoc(doc(dbs.priya, 'groups', gid, 'expenses', 'bad'), {
      title: 'Broken split',
      amount: r(1000),
      payerId: uids.priya,
      participants: { [uids.priya]: r(100), [uids.neha]: r(100) },
      splitMethod: 'unequal',
      personal: false,
      category: 'misc',
      createdBy: uids.priya,
      status: 'active',
      validation: 'pending',
    });
    const d = await waitFor(async () => {
      const x = (await getDoc(doc(dbs.priya, 'groups', gid, 'expenses', 'bad'))).data();
      return x && x.validation !== 'pending' ? x : null;
    });
    expect(d.validation).toBe('invalid');
    expect(d.validationErrors[0]).toMatch(/must equal total/);
    // and it does not change balances
    const meta = (await getDoc(doc(dbs.priya, 'groups', gid, 'meta', 'balances'))).data()!;
    expect(meta.total).toBe(r(15000));
  });

  it('records then confirms settlements and writes the audit trail', async () => {
    await setDoc(doc(dbs.amit, 'groups', gid, 'settlements', 's-amit'), {
      fromUid: uids.amit, toUid: uids.dheeraj, amount: r(1500), status: 'recorded', recordedBy: uids.amit, createdAt: serverTimestamp(),
    });
    // Amit cannot confirm his own payment
    await expect(updateDoc(doc(dbs.amit, 'groups', gid, 'settlements', 's-amit'), { status: 'confirmed', confirmedBy: uids.amit })).rejects.toThrow();
    await updateDoc(doc(dbs.dheeraj, 'groups', gid, 'settlements', 's-amit'), { status: 'confirmed', confirmedBy: uids.dheeraj, confirmedAt: serverTimestamp() });
    const meta = await waitFor(async () => {
      const d = (await getDoc(doc(dbs.dheeraj, 'groups', gid, 'meta', 'balances'))).data();
      return d && d.balances[uids.amit].balance === 0 ? d : null;
    });
    expect(meta.balances[uids.dheeraj].balance).toBe(r(500));
    expect(meta.suggestions).toEqual([{ fromUid: uids.priya, toUid: uids.dheeraj, amount: r(500) }]);

    const audit = await waitFor(async () => {
      const s = await getDocs(collection(dbs.rahul, 'groups', gid, 'audit'));
      const list = s.docs.map((d) => d.data().action as string);
      return list.includes('settlement.confirmed') ? list : null;
    });
    expect(audit.filter((a) => a === 'expense.created')).toHaveLength(6);
    expect(audit).toContain('settlement.recorded');
  });
});
