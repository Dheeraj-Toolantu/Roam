import { useEffect, useMemo, useState } from 'react';

import { subscribeGroup } from '../services/crew';
import { groupSummary, subscribeExpenses, subscribeSettlements } from '../services/split';
import type { Expense, Group, Settlement } from '../types';

export function useGroup(id: string) {
  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  useEffect(() => subscribeGroup(id, setGroup), [id]);
  return group;
}

/** Group + live expenses/settlements + computed summary for one member. */
export function useTripMoney(id: string, uid: string) {
  const group = useGroup(id);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  useEffect(() => subscribeExpenses(id, setExpenses), [id]);
  useEffect(() => subscribeSettlements(id, setSettlements), [id]);
  const summary = useMemo(() => (group ? groupSummary(uid, group, expenses, settlements) : null), [group, uid, expenses, settlements]);
  return { group, expenses, settlements, summary };
}

export function memberName(group: Group | null | undefined, uid: string, me?: string) {
  if (me && uid === me) return 'You';
  return group?.memberNames?.[uid] ?? 'Former member';
}

export function tripDates(g: Pick<Group, 'startDate' | 'endDate'>) {
  const f = (s: string) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
  if (!g.startDate) return 'Dates not set';
  return g.endDate && g.endDate !== g.startDate ? `${f(g.startDate)} – ${f(g.endDate)}` : f(g.startDate);
}

