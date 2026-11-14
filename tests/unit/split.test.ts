import { describe, expect, it } from 'vitest';
import {
  allocate,
  budgetStatus,
  computeBalances,
  formatMoney,
  SplitError,
  suggestSettlements,
  summarize,
  toMinor,
  validateExpense,
  type ExpenseLike,
} from '../../src/logic/split';

const members = ['dheeraj', 'priya', 'rahul', 'amit', 'neha'];
const r = (rupees: number) => rupees * 100;

describe('allocate', () => {
  it('splits equally and the shares always sum to the total', () => {
    const a = allocate(r(15000), 'equal', members);
    expect(Object.values(a)).toEqual([r(3000), r(3000), r(3000), r(3000), r(3000)]);
  });

  it('spreads indivisible paise deterministically (BR-009 rounding)', () => {
    const a = allocate(1000, 'equal', ['a', 'b', 'c']); // ₹10 / 3
    expect(a).toEqual({ a: 334, b: 333, c: 333 });
    expect(Object.values(a).reduce((x, y) => x + y)).toBe(1000);
  });

  it('selective split only includes the chosen members', () => {
    const a = allocate(r(900), 'selective', ['priya', 'neha']);
    expect(a).toEqual({ priya: r(450), neha: r(450) });
  });

  it('unequal split must add up to the total', () => {
    expect(allocate(r(1000), 'unequal', ['a', 'b'], { a: r(700), b: r(300) })).toEqual({ a: r(700), b: r(300) });
    expect(() => allocate(r(1000), 'unequal', ['a', 'b'], { a: r(700), b: r(200) })).toThrow(SplitError);
  });

  it('percentage split uses largest remainder so it sums exactly', () => {
    const a = allocate(1000, 'percentage', ['a', 'b', 'c'], { a: 33.33, b: 33.33, c: 33.34 });
    expect(Object.values(a).reduce((x, y) => x + y)).toBe(1000);
    expect(() => allocate(1000, 'percentage', ['a', 'b'], { a: 50, b: 40 })).toThrow(/100%/);
  });

  it('personal expense is allocated to the payer only', () => {
    expect(allocate(r(500), 'personal', members, {}, 'amit')).toEqual({ amit: r(500) });
  });

  it('rejects zero, negative and fractional totals', () => {
    expect(() => allocate(0, 'equal', members)).toThrow();
    expect(() => allocate(-5, 'equal', members)).toThrow();
    expect(() => allocate(10.5, 'equal', members)).toThrow();
    expect(() => allocate(100, 'equal', [])).toThrow(/participant/);
  });
});

describe('BRD §12.4 worked example', () => {
  // Paid: Dheeraj 5000, Priya 2500, Rahul 3000, Amit 1500, Neha 3000 = 15000, each share 3000
  const paid: [string, number][] = [
    ['dheeraj', 5000],
    ['priya', 2500],
    ['rahul', 3000],
    ['amit', 1500],
    ['neha', 3000],
  ];
  const expenses: ExpenseLike[] = paid.map(([payerId, amt]) => ({
    amount: r(amt),
    payerId,
    participants: allocate(r(amt), 'equal', members),
  }));

  it('computes the documented balances', () => {
    const b = computeBalances(members, expenses);
    expect(b.dheeraj.balance).toBe(r(2000));
    expect(b.priya.balance).toBe(r(-500));
    expect(b.rahul.balance).toBe(0);
    expect(b.amit.balance).toBe(r(-1500));
    expect(b.neha.balance).toBe(0);
    expect(Object.values(b).reduce((s, x) => s + x.balance, 0)).toBe(0);
    expect(b.dheeraj.share).toBe(r(3000));
  });

  it('suggests Priya→Dheeraj ₹500 and Amit→Dheeraj ₹1,500', () => {
    const t = suggestSettlements(computeBalances(members, expenses));
    expect(t).toHaveLength(2);
    expect(t).toContainEqual({ fromUid: 'amit', toUid: 'dheeraj', amount: r(1500) });
    expect(t).toContainEqual({ fromUid: 'priya', toUid: 'dheeraj', amount: r(500) });
  });

  it('only confirmed settlements change balances (record ≠ verify)', () => {
    const recorded = computeBalances(members, expenses, [
      { fromUid: 'amit', toUid: 'dheeraj', amount: r(1500), status: 'recorded' },
    ]);
    expect(recorded.amit.balance).toBe(r(-1500));
    const confirmed = computeBalances(members, expenses, [
      { fromUid: 'amit', toUid: 'dheeraj', amount: r(1500), status: 'confirmed' },
      { fromUid: 'priya', toUid: 'dheeraj', amount: r(500), status: 'confirmed' },
    ]);
    expect(Object.values(confirmed).every((b) => b.balance === 0)).toBe(true);
    expect(suggestSettlements(confirmed)).toEqual([]);
  });

  it('personal, deleted and server-rejected expenses do not affect balances (BR-011)', () => {
    const extra: ExpenseLike[] = [
      { amount: r(999), payerId: 'neha', participants: { neha: r(999) }, personal: true },
      { amount: r(5000), payerId: 'rahul', participants: allocate(r(5000), 'equal', members), status: 'deleted' },
      { amount: r(100), payerId: 'rahul', participants: { rahul: r(50) }, validation: 'invalid' },
    ];
    const b = computeBalances(members, [...expenses, ...extra]);
    expect(b.neha.balance).toBe(0);
    expect(b.rahul.balance).toBe(0);
  });

  it('summarises from one member’s perspective', () => {
    const s = summarize('dheeraj', members, [
      ...expenses.map((e) => ({ ...e, category: 'food' })),
      { amount: r(200), payerId: 'dheeraj', participants: { dheeraj: r(200) }, personal: true },
    ]);
    expect(s.total).toBe(r(15000));
    expect(s.yourShare).toBe(r(3000));
    expect(s.youPaid).toBe(r(5000));
    expect(s.yourBalance).toBe(r(2000));
    expect(s.personalTotal).toBe(r(200));
    expect(s.byCategory).toEqual([{ category: 'food', amount: r(15000) }]);
  });
});

describe('suggestSettlements', () => {
  it('needs at most n-1 transfers and clears all balances', () => {
    const ms = ['a', 'b', 'c', 'd'];
    const ex: ExpenseLike[] = [
      { amount: 1000, payerId: 'a', participants: allocate(1000, 'equal', ms) },
      { amount: 700, payerId: 'b', participants: allocate(700, 'equal', ['b', 'c']) },
      { amount: 333, payerId: 'd', participants: allocate(333, 'equal', ms) },
    ];
    const bal = computeBalances(ms, ex);
    const t = suggestSettlements(bal);
    expect(t.length).toBeLessThanOrEqual(ms.length - 1);
    const after = computeBalances(ms, ex, t.map((x) => ({ ...x, status: 'confirmed' as const })));
    expect(Object.values(after).every((b) => b.balance === 0)).toBe(true);
  });
});

describe('validateExpense', () => {
  it('accepts a correct expense', () => {
    expect(validateExpense({ amount: 300, payerId: 'a', participants: { a: 150, b: 150 } }, ['a', 'b'])).toEqual([]);
  });
  it('flags allocation mismatch, non-members and bad personal expenses', () => {
    expect(validateExpense({ amount: 300, payerId: 'a', participants: { a: 100, b: 150 } }, ['a', 'b'])[0]).toMatch(/must equal/);
    expect(validateExpense({ amount: 300, payerId: 'x', participants: { a: 300 } }, ['a', 'b'])).toContain('payer must be a group member');
    expect(validateExpense({ amount: 300, payerId: 'a', participants: { z: 300 } }, ['a', 'b'])[0]).toMatch(/not a group member/);
    expect(validateExpense({ amount: 300, payerId: 'a', participants: { b: 300 }, personal: true }, ['a', 'b'])).toContain(
      'personal expenses must be allocated to the payer only',
    );
  });
});

describe('money helpers', () => {
  it('parses and formats rupees', () => {
    expect(toMinor('1,250.50')).toBe(125050);
    expect(toMinor('₹ 99')).toBe(9900);
    expect(Number.isNaN(toMinor('abc'))).toBe(true);
    expect(formatMoney(200000)).toBe('₹2,000');
    expect(formatMoney(-50050)).toBe('-₹500.50');
    expect(formatMoney(150000, { sign: true })).toBe('+₹1,500');
  });
  it('reports budget levels', () => {
    expect(budgetStatus(0, 100).level).toBe('none');
    expect(budgetStatus(1000, 500).level).toBe('ok');
    expect(budgetStatus(1000, 850).level).toBe('warning');
    expect(budgetStatus(1000, 1200)).toMatchObject({ level: 'over', remaining: -200 });
  });
});
