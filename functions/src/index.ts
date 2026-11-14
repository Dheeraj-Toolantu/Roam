/**
 * ROAM 2.0 Cloud Functions.
 *
 * Server-side financial integrity for ROAM SPLIT (BRD §12.6, §16.3, BR-008..BR-012):
 *  - every expense write is re-validated here (allocations must equal the total,
 *    payer and participants must be members) and marked 'ok' or 'invalid'
 *  - an append-only audit log of expense and settlement changes
 *  - authoritative group balances in groups/{gid}/meta/balances
 *  - budget alerts when spending crosses the configured threshold (BRD §12.8)
 *
 * Clients cannot write `audit` or `meta` (see firestore.rules); the Admin SDK can.
 */
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import { budgetStatus, computeBalances, formatMoney, suggestSettlements, validateExpense, type ExpenseLike, type SettlementLike } from './shared/split';

initializeApp();
// Firestore triggers must run in a region matching the database location.
// jododeal-b845b's Firestore is in the nam5 (US) multi-region → us-central1.
setGlobalOptions({ region: process.env.FUNCTIONS_REGION || 'us-central1', maxInstances: 10 });
const db = getFirestore();

interface GroupDoc {
  name: string;
  memberIds: string[];
  memberNames?: Record<string, string>;
  budget?: number;
  budgetAlertPct?: number;
}

async function loadGroup(gid: string) {
  const snap = await db.doc(`groups/${gid}`).get();
  return snap.exists ? (snap.data() as GroupDoc) : null;
}

/** Recompute balances from scratch (source of truth = expenses + confirmed settlements). */
export async function recomputeBalances(gid: string) {
  const group = await loadGroup(gid);
  if (!group) return null;
  const [ex, st] = await Promise.all([db.collection(`groups/${gid}/expenses`).get(), db.collection(`groups/${gid}/settlements`).get()]);
  const expenses = ex.docs.map((d) => d.data() as ExpenseLike);
  const settlements = st.docs.map((d) => d.data() as SettlementLike);
  const everyone = Array.from(new Set([...group.memberIds, ...Object.keys(group.memberNames ?? {})]));
  const balances = computeBalances(everyone, expenses, settlements);
  const total = expenses
    .filter((e) => e.status !== 'deleted' && !e.personal && e.validation !== 'invalid')
    .reduce((s, e) => s + e.amount, 0);
  const metaRef = db.doc(`groups/${gid}/meta/balances`);
  const prev = (await metaRef.get()).data() ?? {};
  const budget = budgetStatus(group.budget ?? 0, total, group.budgetAlertPct ?? 80);
  await metaRef.set({
    balances,
    total,
    suggestions: suggestSettlements(balances),
    budgetLevel: budget.level,
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Budget alert when crossing into warning/over (not on every write)
  const rank = { none: 0, ok: 1, warning: 2, over: 3 } as const;
  const before = (prev.budgetLevel as keyof typeof rank) ?? 'none';
  if (rank[budget.level] > rank[before] && (budget.level === 'warning' || budget.level === 'over')) {
    const text =
      budget.level === 'over'
        ? `${group.name} is over budget: ${formatMoney(total)} of ${formatMoney(budget.budget)}`
        : `${group.name} has used ${Math.round(budget.pct)}% of its ${formatMoney(budget.budget)} budget`;
    const batch = db.batch();
    for (const uid of group.memberIds) {
      batch.set(db.collection(`users/${uid}/notifications`).doc(), {
        type: 'budget',
        fromUid: 'roam',
        fromName: 'ROAM Split',
        text,
        link: `/trip/${gid}/split`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  return { balances, total };
}

async function audit(gid: string, entry: { action: string; text: string; by: string | null; ref: string }) {
  await db.collection(`groups/${gid}/audit`).add({ ...entry, at: Date.now() });
}

export const onExpenseWritten = onDocumentWritten('groups/{gid}/expenses/{eid}', async (event) => {
  const { gid, eid } = event.params;
  const after = event.data?.after.exists ? (event.data.after.data() as ExpenseLike & { title: string; createdBy: string }) : null;
  const before = event.data?.before.exists ? (event.data.before.data() as ExpenseLike & { title: string }) : null;
  // Only act on client writes (which always set validation = 'pending'); ignore our own update below.
  if (!after || after.validation !== 'pending') return;

  const group = await loadGroup(gid);
  const members = group ? Array.from(new Set([...group.memberIds, ...Object.keys(group.memberNames ?? {})])) : [];
  const problems = group ? validateExpense(after, members) : ['group not found'];
  await event.data!.after.ref.update({
    validation: problems.length ? 'invalid' : 'ok',
    validationErrors: problems,
    validatedAt: FieldValue.serverTimestamp(),
  });

  const name = (uid: string) => group?.memberNames?.[uid] ?? 'A member';
  const action = !before ? 'expense.created' : after.status === 'deleted' && before.status !== 'deleted' ? 'expense.deleted' : 'expense.updated';
  const verb = action === 'expense.created' ? 'added' : action === 'expense.deleted' ? 'deleted' : 'edited';
  await audit(gid, {
    action,
    ref: eid,
    by: after.createdBy ?? null,
    text: `${name(after.createdBy)} ${verb} “${after.title}” (${formatMoney(after.amount)})${problems.length ? ' — rejected: ' + problems[0] : ''}`,
  });
  await recomputeBalances(gid);
});

export const onSettlementWritten = onDocumentWritten('groups/{gid}/settlements/{sid}', async (event) => {
  const { gid, sid } = event.params;
  const after = event.data?.after.exists ? (event.data.after.data() as SettlementLike & { recordedBy: string; confirmedBy?: string }) : null;
  const before = event.data?.before.exists ? (event.data.before.data() as SettlementLike) : null;
  if (!after || (before && before.status === after.status)) return;
  const group = await loadGroup(gid);
  const name = (uid: string) => group?.memberNames?.[uid] ?? 'A member';
  const text =
    after.status === 'recorded'
      ? `${name(after.recordedBy)} recorded ${name(after.fromUid)} → ${name(after.toUid)} ${formatMoney(after.amount)}`
      : after.status === 'confirmed'
        ? `${name(after.toUid)} confirmed receiving ${formatMoney(after.amount)} from ${name(after.fromUid)}`
        : `${name(after.toUid)} did not confirm ${formatMoney(after.amount)} from ${name(after.fromUid)}`;
  await audit(gid, { action: `settlement.${after.status}`, ref: sid, by: after.confirmedBy ?? after.recordedBy, text });
  if (after.status !== 'recorded') await recomputeBalances(gid);
});
