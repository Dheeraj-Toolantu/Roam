import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { confirmAsync } from '@/components/PostCard';
import { Avatar, Button, Card, Empty, ErrorText, Header, Loading, Pill, Row, Screen, SectionTitle, goBackOr } from '@/components/ui';
import { memberName, useTripMoney } from '@/hooks/useTrip';
import { TripUnavailable } from '@/components/TripUnavailable';
import { useMe } from '@/lib/session';
import { EXPENSE_CATEGORIES, formatMoney, SPLIT_METHODS } from '@/logic/split';
import { deleteExpense } from '@/services/split';
import { errorMessage, timeAgo } from '@/services/util';
import { colors, radius, type } from '@/theme';

export default function ExpenseDetail() {
  const { id, expenseId } = useLocalSearchParams<{ id: string; expenseId: string }>();
  const me = useMe();
  const { group, expenses } = useTripMoney(id, me.uid);
  const [err, setErr] = useState<string | null>(null);
  const e = expenses.find((x) => x.id === expenseId);

  if (group === undefined) return <Screen><Loading /></Screen>;
  if (!group || !group.memberIds.includes(me.uid)) return <TripUnavailable title="Expense" />;
  if (!e) return <Screen><Header title="Expense" /><Empty icon="receipt-outline" title="Loading or not found" /></Screen>;

  const canEdit = (e.createdBy === me.uid || group.adminIds.includes(me.uid)) && e.status !== 'deleted' && (!e.personal || e.payerId === me.uid);
  const cat = EXPENSE_CATEGORIES.find((c) => c.id === e.category);

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={e.title} subtitle={group.name} />
      <Card>
        <Text style={[type.hero, { textAlign: 'center' }]}>{formatMoney(e.amount)}</Text>
        <Row style={{ justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <Pill text={cat?.label ?? e.category} color={colors.cyan} />
          <Pill text={SPLIT_METHODS.find((m) => m.id === e.splitMethod)?.label ?? e.splitMethod} color={colors.violet} />
          {e.status === 'deleted' && <Pill text="Deleted" color={colors.red} />}
          {e.validation === 'pending' && <Pill text="Verifying" color={colors.yellow} />}
          {e.validation === 'ok' && <Pill text="Verified" color={colors.green} icon="shield-checkmark" />}
          {e.validation === 'invalid' && <Pill text="Rejected by server" color={colors.red} icon="alert-circle" />}
        </Row>
        <Text style={[type.small, { textAlign: 'center', marginTop: 10 }]}>
          Paid by {memberName(group, e.payerId, me.uid)} · {e.date} · added {timeAgo(e.createdAt)} by {memberName(group, e.createdBy, me.uid)}
        </Text>
      </Card>
      {e.validation === 'invalid' && !!e.validationErrors?.length && <ErrorText text={e.validationErrors.join('; ')} />}

      <SectionTitle title={e.personal ? 'Personal expense' : 'Split between'} />
      <Card>
        {Object.entries(e.participants).map(([u, amt]) => (
          <Row key={u} style={{ paddingVertical: 8 }}>
            <Avatar name={memberName(group, u)} size={30} />
            <Text style={[type.body, { flex: 1 }]}>{memberName(group, u, me.uid)}</Text>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{formatMoney(amt)}</Text>
          </Row>
        ))}
      </Card>

      {!!e.notes && (
        <>
          <SectionTitle title="Notes" />
          <Text style={type.body}>{e.notes}</Text>
        </>
      )}
      {!!e.receiptUrl && (
        <>
          <SectionTitle title="Receipt" />
          <Image source={{ uri: e.receiptUrl }} style={{ width: '100%', height: 260, borderRadius: radius.md }} contentFit="contain" />
        </>
      )}

      <ErrorText text={err} />
      {canEdit && (
        <View style={{ gap: 10, marginTop: 20 }}>
          <Button title="Edit expense" icon="create-outline" variant="secondary" onPress={() => router.push(`/trip/${id}/add-expense?expenseId=${e.id}`)} />
          <Button
            title="Delete expense"
            icon="trash-outline"
            variant="danger"
            testID="delete-expense"
            onPress={async () => {
              if (!(await confirmAsync('Delete expense?', 'Balances will be recalculated. The change is kept in the audit history.', 'Delete'))) return;
              try {
                await deleteExpense(group, e);
                goBackOr(`/trip/${id}/split`);
              } catch (x) {
                setErr(errorMessage(x));
              }
            }}
          />
        </View>
      )}
    </Screen>
  );
}
