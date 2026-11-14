import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar, Button, Card, Empty, Header, InfoText, Loading, Pill, ProgressBar, Row, Screen, SectionTitle } from '@/components/ui';
import { memberName, useTripMoney } from '@/hooks/useTrip';
import { TripUnavailable } from '@/components/TripUnavailable';
import { useMe } from '@/lib/session';
import { computeBalances, EXPENSE_CATEGORIES, formatMoney } from '@/logic/split';
import { subscribeAudit } from '@/services/split';
import { timeAgo } from '@/services/util';
import { colors, type } from '@/theme';

export default function SplitDashboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const { group, expenses, settlements, summary } = useTripMoney(id, me.uid);
  const [audit, setAudit] = useState<{ id: string; action: string; text: string; at: number }[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  useEffect(() => (showAudit ? subscribeAudit(id, setAudit) : undefined), [id, showAudit]);

  const balances = useMemo(() => {
    if (!group) return [];
    const everyone = Array.from(new Set([...group.memberIds, ...Object.keys(group.memberNames ?? {})]));
    return Object.values(computeBalances(everyone, expenses, settlements)).filter((b) => group.memberIds.includes(b.uid) || b.balance !== 0);
  }, [group, expenses, settlements]);

  if (group === undefined) return <Screen><Loading /></Screen>;
  if (!group || !group.memberIds.includes(me.uid)) return <TripUnavailable title="ROAM Split" />;
  if (!summary) return <Screen><Loading /></Screen>;

  const visible = expenses.filter((e) => e.status !== 'deleted');
  const pendingConfirm = settlements.filter((s) => s.status === 'recorded' && s.toUid === me.uid).length;

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="ROAM Split" subtitle={group.name} />

      <Card>
        <Text style={[type.h3, { marginBottom: 12 }]}>Trip Expense Summary</Text>
        <SummaryRow label="Total Expense" value={formatMoney(summary.total)} testID="sum-total" />
        <SummaryRow label="Your Share" value={formatMoney(summary.yourShare)} testID="sum-share" />
        <SummaryRow label="You Paid" value={formatMoney(summary.youPaid)} testID="sum-paid" />
        <SummaryRow
          label={summary.yourBalance >= 0 ? 'You Will Receive' : 'You Owe'}
          value={formatMoney(Math.abs(summary.yourBalance))}
          color={summary.yourBalance > 0 ? colors.green : summary.yourBalance < 0 ? colors.red : colors.text}
          big
          testID="sum-balance"
        />
        {summary.personalTotal > 0 && <Text style={[type.tiny, { marginTop: 6 }]}>Personal expenses (not shared): {formatMoney(summary.personalTotal)}</Text>}
      </Card>

      <Row style={{ marginTop: 14 }} gap={10}>
        <Button testID="add-expense" style={{ flex: 1 }} variant="purple" icon="add-circle-outline" title="Add Expense" onPress={() => router.push(`/trip/${id}/add-expense`)} />
        <Button testID="settle-up" style={{ flex: 1 }} icon="swap-horizontal" title={pendingConfirm ? `Settle Up (${pendingConfirm})` : 'Settle Up'} onPress={() => router.push(`/trip/${id}/settle`)} />
      </Row>

      {summary.budget.level !== 'none' ? (
        <Card style={{ marginTop: 14 }} testID="budget-card">
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={type.h3}>Group Budget</Text>
            {summary.budget.level === 'over' ? (
              <Pill text="Over budget" color={colors.red} icon="alert-circle" />
            ) : summary.budget.level === 'warning' ? (
              <Pill text={`${Math.round(summary.budget.pct)}% used`} color={colors.yellow} icon="warning" />
            ) : (
              <Pill text="On track" color={colors.green} icon="checkmark" />
            )}
          </Row>
          <View style={{ marginVertical: 10 }}>
            <ProgressBar pct={summary.budget.pct} color={summary.budget.level === 'over' ? colors.red : summary.budget.level === 'warning' ? colors.yellow : colors.cyan} />
          </View>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={type.small}>Spent {formatMoney(summary.budget.spent)}</Text>
            <Text style={type.small}>
              {summary.budget.remaining >= 0 ? `${formatMoney(summary.budget.remaining)} left` : `${formatMoney(-summary.budget.remaining)} over`} of {formatMoney(summary.budget.budget)}
            </Text>
          </Row>
        </Card>
      ) : (
        group.adminIds.includes(me.uid) && (
          <Pressable onPress={() => router.push(`/trip/${id}/settings`)} style={{ marginTop: 12 }}>
            <InfoText text="Set a group budget in trip settings to get alerts as you approach it." icon="wallet-outline" />
          </Pressable>
        )
      )}

      {summary.byCategory.length > 0 && (
        <>
          <SectionTitle title="By Category" />
          <Card>
            {summary.byCategory.map((c) => {
              const meta = EXPENSE_CATEGORIES.find((x) => x.id === c.category);
              return (
                <View key={c.category} style={{ marginBottom: 10 }}>
                  <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                    <Row gap={6}>
                      <Ionicons name={(meta?.icon ?? 'pricetag') as never} size={14} color={colors.cyan} />
                      <Text style={type.small}>{meta?.label ?? c.category}</Text>
                    </Row>
                    <Text style={type.small}>{formatMoney(c.amount)}</Text>
                  </Row>
                  <ProgressBar pct={(c.amount / summary.total) * 100} height={6} color={colors.violet} />
                </View>
              );
            })}
          </Card>
        </>
      )}

      <SectionTitle title="Balances" />
      <Card>
        {balances.map((b) => (
          <Row key={b.uid} style={{ paddingVertical: 8 }}>
            <Avatar name={memberName(group, b.uid)} size={32} />
            <View style={{ flex: 1 }}>
              <Text style={type.body}>{memberName(group, b.uid, me.uid)}</Text>
              <Text style={type.tiny}>
                Paid {formatMoney(b.paid)} · Share {formatMoney(b.share)}
              </Text>
            </View>
            <Text style={{ fontWeight: '800', color: b.balance > 0 ? colors.green : b.balance < 0 ? colors.red : colors.textMuted }}>
              {b.balance === 0 ? 'Settled' : formatMoney(b.balance, { sign: true })}
            </Text>
          </Row>
        ))}
      </Card>

      <SectionTitle title="Recent Expenses" />
      {visible.length === 0 ? (
        <Empty icon="receipt-outline" title="No expenses yet" text="Add the first expense — ROAM keeps everyone's balance up to date." />
      ) : (
        visible.map((e) => {
          const cat = EXPENSE_CATEGORIES.find((c) => c.id === e.category);
          return (
            <Card key={e.id} style={{ marginBottom: 10, padding: 14 }} onPress={() => router.push(`/trip/${id}/expense/${e.id}`)} testID="expense-row">
              <Row>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={(cat?.icon ?? 'pricetag') as never} size={18} color={colors.cyan} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={type.h3} numberOfLines={1}>
                    {e.title}
                  </Text>
                  <Text style={type.tiny}>
                    {formatMoney(e.amount)} · Paid by {memberName(group, e.payerId, me.uid)} · {e.date || timeAgo(e.createdAt)}
                  </Text>
                </View>
                {e.personal ? (
                  <Pill text="Personal" color={colors.textMuted} />
                ) : e.validation === 'invalid' ? (
                  <Pill text="Rejected" color={colors.red} icon="alert-circle" />
                ) : e.validation === 'pending' ? (
                  <Pill text="Verifying" color={colors.yellow} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                )}
              </Row>
            </Card>
          );
        })
      )}

      <Pressable onPress={() => setShowAudit(!showAudit)} style={{ marginTop: 10 }}>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 10 }}>
          <Text style={type.h3}>Audit history</Text>
          <Ionicons name={showAudit ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </Row>
      </Pressable>
      {showAudit &&
        (audit.length === 0 ? (
          <Text style={type.small}>Changes to expenses and settlements are logged here by the server.</Text>
        ) : (
          audit.map((a) => (
            <Text key={a.id} style={[type.small, { paddingVertical: 4 }]}>
              {new Date(a.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {a.text}
            </Text>
          ))
        ))}
    </Screen>
  );
}

function SummaryRow({ label, value, color = colors.text, big, testID }: { label: string; value: string; color?: string; big?: boolean; testID?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 7, borderTopWidth: big ? 1 : 0, borderColor: colors.cardBorder, marginTop: big ? 4 : 0 }}>
      <Text style={big ? type.h3 : type.small}>{label}</Text>
      <Text style={{ color, fontWeight: '800', fontSize: big ? 22 : 15 }} testID={testID}>
        {value}
      </Text>
    </Row>
  );
}
