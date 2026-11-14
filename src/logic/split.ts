/**
 * ROAM SPLIT – pure expense allocation, balance and settlement logic.
 *
 * All amounts are integers in minor currency units (paise for INR) so that
 * allocations always add up exactly (BR-009) and floating-point drift can
 * never create a phantom debt.
 *
 * This file has NO imports so it can be copied verbatim into the Cloud
 * Functions package (functions/src/shared/split.ts) and run server-side.
 */

export type SplitMethod = 'equal' | 'unequal' | 'percentage' | 'selective' | 'personal';

export const SPLIT_METHODS: { id: SplitMethod; label: string; hint: string }[] = [
  { id: 'equal', label: 'Equal', hint: 'Divide equally among all members' },
  { id: 'selective', label: 'Selective', hint: 'Divide equally among selected members' },
  { id: 'unequal', label: 'Unequal', hint: 'Enter an amount for each person' },
  { id: 'percentage', label: 'Percentage', hint: 'Allocate by percentage' },
  { id: 'personal', label: 'Personal', hint: 'Excluded from group settlement' },
];

export type ExpenseCategory =
  | 'accommodation'
  | 'food'
  | 'transport'
  | 'flights'
  | 'shopping'
  | 'activities'
  | 'entertainment'
  | 'misc';

export const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string; icon: string }[] = [
  { id: 'accommodation', label: 'Stay', icon: 'bed' },
  { id: 'food', label: 'Food & Drinks', icon: 'restaurant' },
  { id: 'transport', label: 'Transport', icon: 'car' },
  { id: 'flights', label: 'Flights', icon: 'airplane' },
  { id: 'shopping', label: 'Shopping', icon: 'bag-handle' },
  { id: 'activities', label: 'Activities', icon: 'bicycle' },
  { id: 'entertainment', label: 'Entertainment', icon: 'musical-notes' },
  { id: 'misc', label: 'Misc', icon: 'ellipsis-horizontal-circle' },
];

export interface ExpenseLike {
  amount: number; // minor units
  payerId: string;
  participants: Record<string, number>; // uid -> share in minor units
  personal?: boolean;
  status?: 'active' | 'deleted';
  validation?: 'ok' | 'invalid' | 'pending';
  category?: string;
}

export interface SettlementLike {
  fromUid: string;
  toUid: string;
  amount: number; // minor units
  status: 'recorded' | 'confirmed' | 'rejected';
}

export interface MemberBalance {
  uid: string;
  paid: number;
  share: number;
  settledOut: number; // confirmed money this member has paid to others
  settledIn: number; // confirmed money this member has received
  balance: number; // + receives, - owes
}

export class SplitError extends Error {}

/** Convert a user-entered rupee value (e.g. "1,250.50") to paise. */
export function toMinor(value: string | number): number {
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[,\s₹]/g, ''));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

export function fromMinor(minor: number): number {
  return minor / 100;
}

export function formatMoney(minor: number, opts: { sign?: boolean; decimals?: boolean } = {}): string {
  const abs = Math.abs(minor) / 100;
  const hasFraction = Math.abs(minor) % 100 !== 0;
  const body = abs.toLocaleString('en-IN', {
    minimumFractionDigits: opts.decimals || hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
  const sign = minor < 0 ? '-' : opts.sign && minor > 0 ? '+' : '';
  return `${sign}₹${body}`;
}

/** Spread `remainder` single paise over `ids` in a deterministic order. */
function spreadRemainder(base: Record<string, number>, ids: string[], remainder: number) {
  for (let i = 0; i < remainder; i++) base[ids[i % ids.length]] += 1;
}

/**
 * Allocate a total across participants.
 *  - equal / selective: equal division among `participants`
 *  - unequal: `inputs` holds each participant's amount in minor units (must sum to total)
 *  - percentage: `inputs` holds each participant's percentage (must sum to 100)
 *  - personal: entire amount allocated to the payer, excluded from group balances
 */
export function allocate(
  total: number,
  method: SplitMethod,
  participants: string[],
  inputs: Record<string, number> = {},
  payerId?: string,
): Record<string, number> {
  if (!Number.isInteger(total) || total <= 0) throw new SplitError('Amount must be greater than zero');
  const ids = Array.from(new Set(participants));

  if (method === 'personal') {
    const owner = payerId ?? ids[0];
    if (!owner) throw new SplitError('A payer is required');
    return { [owner]: total };
  }
  if (ids.length === 0) throw new SplitError('Select at least one participant');

  if (method === 'equal' || method === 'selective') {
    const each = Math.floor(total / ids.length);
    const out: Record<string, number> = {};
    ids.forEach((id) => (out[id] = each));
    spreadRemainder(out, ids, total - each * ids.length);
    return out;
  }

  if (method === 'unequal') {
    const out: Record<string, number> = {};
    for (const id of ids) {
      const v = inputs[id] ?? 0;
      if (!Number.isInteger(v) || v < 0) throw new SplitError('Amounts must be positive');
      if (v > 0) out[id] = v;
    }
    const sum = Object.values(out).reduce((a, b) => a + b, 0);
    if (sum !== total) {
      throw new SplitError(
        `Amounts add up to ${formatMoney(sum)} but the expense is ${formatMoney(total)}`,
      );
    }
    return out;
  }

  if (method === 'percentage') {
    const pcts = ids.map((id) => inputs[id] ?? 0);
    if (pcts.some((p) => !Number.isFinite(p) || p < 0)) throw new SplitError('Percentages must be positive');
    const pctSum = pcts.reduce((a, b) => a + b, 0);
    if (Math.abs(pctSum - 100) > 0.001) throw new SplitError(`Percentages add up to ${round2(pctSum)}%, not 100%`);
    // Largest-remainder method so the result sums exactly to `total`.
    const raw = ids.map((id, i) => ({ id, exact: (total * pcts[i]) / 100 }));
    const out: Record<string, number> = {};
    raw.forEach((r) => (out[r.id] = Math.floor(r.exact)));
    let remainder = total - Object.values(out).reduce((a, b) => a + b, 0);
    const order = [...raw].sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)));
    for (let i = 0; remainder > 0; i++, remainder--) out[order[i % order.length].id] += 1;
    for (const id of Object.keys(out)) if (out[id] === 0) delete out[id];
    return out;
  }

  throw new SplitError(`Unknown split method: ${method as string}`);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Validate a stored expense (used client-side before writing and by the Cloud
 * Function as the authoritative check). Returns a list of problems.
 */
export function validateExpense(e: ExpenseLike, memberIds: string[]): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(e.amount) || e.amount <= 0) problems.push('amount must be a positive integer (minor units)');
  if (!e.payerId) problems.push('payer is required');
  else if (!memberIds.includes(e.payerId)) problems.push('payer must be a group member');
  const entries = Object.entries(e.participants ?? {});
  if (entries.length === 0) problems.push('at least one participant is required');
  let sum = 0;
  for (const [uid, share] of entries) {
    if (!memberIds.includes(uid)) problems.push(`participant ${uid} is not a group member`);
    if (!Number.isInteger(share) || share < 0) problems.push(`share for ${uid} must be a non-negative integer`);
    sum += share;
  }
  if (entries.length && sum !== e.amount) problems.push(`allocations (${sum}) must equal total (${e.amount})`);
  if (e.personal && entries.length && (entries.length !== 1 || entries[0][0] !== e.payerId)) {
    problems.push('personal expenses must be allocated to the payer only');
  }
  return problems;
}

function countsTowardsBalance(e: ExpenseLike) {
  return e.status !== 'deleted' && !e.personal && e.validation !== 'invalid';
}

/** Compute each member's balance. Positive = should receive, negative = owes. */
export function computeBalances(
  memberIds: string[],
  expenses: ExpenseLike[],
  settlements: SettlementLike[] = [],
): Record<string, MemberBalance> {
  const out: Record<string, MemberBalance> = {};
  const ensure = (uid: string) =>
    (out[uid] ??= { uid, paid: 0, share: 0, settledIn: 0, settledOut: 0, balance: 0 });
  memberIds.forEach(ensure);

  for (const e of expenses) {
    if (!countsTowardsBalance(e)) continue;
    ensure(e.payerId).paid += e.amount;
    for (const [uid, share] of Object.entries(e.participants)) ensure(uid).share += share;
  }
  for (const s of settlements) {
    if (s.status !== 'confirmed') continue;
    ensure(s.fromUid).settledOut += s.amount;
    ensure(s.toUid).settledIn += s.amount;
  }
  for (const b of Object.values(out)) b.balance = b.paid - b.share + b.settledOut - b.settledIn;
  return out;
}

export interface SuggestedTransfer {
  fromUid: string;
  toUid: string;
  amount: number;
}

/**
 * Greedy minimum-cash-flow settlement: repeatedly match the biggest debtor
 * with the biggest creditor. Produces at most n-1 transfers.
 */
export function suggestSettlements(balances: Record<string, MemberBalance>): SuggestedTransfer[] {
  const debtors = Object.values(balances)
    .filter((b) => b.balance < 0)
    .map((b) => ({ uid: b.uid, amt: -b.balance }));
  const creditors = Object.values(balances)
    .filter((b) => b.balance > 0)
    .map((b) => ({ uid: b.uid, amt: b.balance }));
  const byAmt = (a: { uid: string; amt: number }, b: { uid: string; amt: number }) =>
    b.amt - a.amt || a.uid.localeCompare(b.uid);
  const transfers: SuggestedTransfer[] = [];
  debtors.sort(byAmt);
  creditors.sort(byAmt);
  while (debtors.length && creditors.length) {
    const d = debtors[0];
    const c = creditors[0];
    const amt = Math.min(d.amt, c.amt);
    transfers.push({ fromUid: d.uid, toUid: c.uid, amount: amt });
    d.amt -= amt;
    c.amt -= amt;
    if (d.amt === 0) debtors.shift();
    if (c.amt === 0) creditors.shift();
    debtors.sort(byAmt);
    creditors.sort(byAmt);
  }
  return transfers;
}

export interface GroupExpenseSummary {
  total: number; // shared (non-personal) spend
  personalTotal: number;
  yourShare: number;
  youPaid: number;
  yourBalance: number;
  byCategory: { category: string; amount: number }[];
}

export function summarize(uid: string, memberIds: string[], expenses: ExpenseLike[], settlements: SettlementLike[] = []): GroupExpenseSummary {
  const balances = computeBalances(memberIds, expenses, settlements);
  const me = balances[uid] ?? { paid: 0, share: 0, balance: 0 };
  let total = 0;
  let personalTotal = 0;
  const cats: Record<string, number> = {};
  for (const e of expenses) {
    if (e.status === 'deleted' || e.validation === 'invalid') continue;
    if (e.personal) {
      if (e.payerId === uid) personalTotal += e.amount;
      continue;
    }
    total += e.amount;
    const c = e.category ?? 'misc';
    cats[c] = (cats[c] ?? 0) + e.amount;
  }
  return {
    total,
    personalTotal,
    yourShare: me.share,
    youPaid: me.paid,
    yourBalance: me.balance,
    byCategory: Object.entries(cats)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export interface BudgetStatus {
  budget: number;
  spent: number;
  remaining: number;
  pct: number; // 0..100+
  level: 'none' | 'ok' | 'warning' | 'over';
}

export function budgetStatus(budget: number | undefined | null, spent: number, alertPct = 80): BudgetStatus {
  if (!budget || budget <= 0) return { budget: 0, spent, remaining: 0, pct: 0, level: 'none' };
  const pct = (spent / budget) * 100;
  return {
    budget,
    spent,
    remaining: budget - spent,
    pct,
    level: pct > 100 ? 'over' : pct >= alertPct ? 'warning' : 'ok',
  };
}

/**
 * Whether to show "Verifying" for an expense awaiting server validation.
 * The app already validates allocations before saving; if the server check hasn't
 * run within a couple of minutes (e.g. Cloud Functions not deployed), stop showing it.
 */
export function showVerifying(validation: string | undefined, createdAtMs: number | null, now = Date.now(), graceMs = 120_000): boolean {
  if (validation !== 'pending') return false;
  if (createdAtMs == null) return true; // just written, server timestamp pending
  return now - createdAtMs < graceMs;
}
