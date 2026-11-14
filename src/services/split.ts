import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { db } from '../lib/firebase';
import {
  allocate,
  budgetStatus,
  formatMoney,
  summarize,
  validateExpense,
  type ExpenseCategory,
  type SplitMethod,
} from '../logic/split';
import type { Expense, Group, Settlement, UserProfile } from '../types';
import { notify, notifyMany } from './notifications';
import { addTimelineItem } from './crew';
import { randomId, withId } from './util';

export interface ExpenseDraft {
  title: string;
  amount: number; // minor units
  payerId: string;
  category: ExpenseCategory;
  splitMethod: SplitMethod;
  participantIds: string[];
  inputs: Record<string, number>; // unequal (minor units) or percentage
  notes: string;
  date: string;
  receiptUrl?: string | null;
}

export function buildExpense(group: Group, me: string, d: ExpenseDraft) {
  const personal = d.splitMethod === 'personal';
  const participants = allocate(d.amount, d.splitMethod, d.participantIds, d.inputs, personal ? me : d.payerId);
  const payerId = personal ? me : d.payerId;
  const problems = validateExpense({ amount: d.amount, payerId, participants, personal }, group.memberIds);
  if (!d.title.trim()) problems.unshift('Add a title');
  if (problems.length) throw new Error(problems[0]);
  return {
    title: d.title.trim(),
    amount: d.amount,
    payerId,
    category: d.category,
    splitMethod: d.splitMethod,
    participants,
    personal,
    notes: d.notes.trim(),
    receiptUrl: d.receiptUrl ?? null,
    date: d.date,
  };
}

/**
 * Create an expense. The document id is an idempotency key generated once per
 * form submission, so a retried/double-tapped submit can never create a
 * duplicate transaction (BRD §16.5).
 */
export async function addExpense(group: Group, me: UserProfile, d: ExpenseDraft, requestId = randomId()) {
  const e = buildExpense(group, me.uid, d);
  await setDoc(doc(db, 'groups', group.id, 'expenses', requestId), {
    ...e,
    createdBy: me.uid,
    status: 'active',
    validation: 'pending',
    createdAt: serverTimestamp(),
  });
  if (!e.personal) {
    await addTimelineItem(group.id, me, { type: 'expense', text: `${me.displayName} added “${e.title}” · ${formatMoney(e.amount)}` }).catch(() => {});
    await notifyMany(
      Object.keys(e.participants),
      me,
      'expense',
      `${me.displayName} added ${formatMoney(e.amount)} for “${e.title}” in ${group.name}`,
      `/trip/${group.id}/split`,
    );
  }
  return requestId;
}

export async function updateExpense(group: Group, me: UserProfile, id: string, d: ExpenseDraft) {
  const e = buildExpense(group, me.uid, d);
  await updateDoc(doc(db, 'groups', group.id, 'expenses', id), { ...e, validation: 'pending', updatedAt: serverTimestamp() });
}

export async function deleteExpense(group: Group, ex: Expense) {
  await updateDoc(doc(db, 'groups', group.id, 'expenses', ex.id), {
    status: 'deleted',
    validation: 'pending',
    updatedAt: serverTimestamp(),
  });
}

export function subscribeExpenses(groupId: string, cb: (e: Expense[]) => void) {
  const q = query(collection(db, 'groups', groupId, 'expenses'), orderBy('createdAt', 'desc'), limit(500));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => withId<Expense>(d))), () => cb([]));
}

export function subscribeSettlements(groupId: string, cb: (s: Settlement[]) => void) {
  const q = query(collection(db, 'groups', groupId, 'settlements'), orderBy('createdAt', 'desc'), limit(500));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => withId<Settlement>(d))), () => cb([]));
}

export function subscribeAudit(groupId: string, cb: (a: { id: string; action: string; text: string; at: number }[]) => void) {
  const q = query(collection(db, 'groups', groupId, 'audit'), orderBy('at', 'desc'), limit(100));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => withId(d))), () => cb([]));
}

export async function recordSettlement(group: Group, me: UserProfile, fromUid: string, toUid: string, amount: number, existing: Settlement[]) {
  if (existing.some((s) => s.status === 'recorded' && s.fromUid === fromUid && s.toUid === toUid)) {
    throw new Error('A payment between these members is already waiting for confirmation');
  }
  const id = randomId();
  await setDoc(doc(db, 'groups', group.id, 'settlements', id), {
    fromUid,
    toUid,
    amount,
    status: 'recorded',
    recordedBy: me.uid,
    createdAt: serverTimestamp(),
  });
  const other = me.uid === fromUid ? toUid : fromUid;
  await notify(
    other,
    me,
    'settlement',
    me.uid === fromUid
      ? `${me.displayName} recorded paying you ${formatMoney(amount)} in ${group.name}. Please confirm.`
      : `${me.displayName} recorded receiving ${formatMoney(amount)} from you in ${group.name}.`,
    `/trip/${group.id}/settle`,
  );
  return id;
}

export async function confirmSettlement(group: Group, me: UserProfile, s: Settlement, ok: boolean) {
  await updateDoc(doc(db, 'groups', group.id, 'settlements', s.id), {
    status: ok ? 'confirmed' : 'rejected',
    confirmedBy: me.uid,
    confirmedAt: serverTimestamp(),
  });
  await notify(
    s.fromUid,
    me,
    'settlement',
    ok ? `${me.displayName} confirmed your payment of ${formatMoney(s.amount)}` : `${me.displayName} did not confirm a payment of ${formatMoney(s.amount)}`,
    `/trip/${group.id}/settle`,
  );
}

export function groupSummary(uid: string, group: Group, expenses: Expense[], settlements: Settlement[]) {
  // Include past members so leaving never erases balances (BR-012)
  const everyone = Array.from(new Set([...group.memberIds, ...Object.keys(group.memberNames ?? {})]));
  const summary = summarize(uid, everyone, expenses, settlements);
  return { ...summary, budget: budgetStatus(group.budget, summary.total, group.budgetAlertPct) };
}
