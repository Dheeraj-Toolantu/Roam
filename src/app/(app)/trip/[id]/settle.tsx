import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar, Button, Card, Empty, ErrorText, Header, Loading, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { memberName, useTripMoney } from '@/hooks/useTrip';
import { TripUnavailable } from '@/components/TripUnavailable';
import { useMe } from '@/lib/session';
import { computeBalances, formatMoney, suggestSettlements } from '@/logic/split';
import { confirmSettlement, recordSettlement } from '@/services/split';
import { errorMessage, timeAgo } from '@/services/util';
import { colors, type } from '@/theme';

export default function SettleUp() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const { group, expenses, settlements } = useTripMoney(id, me.uid);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const transfers = useMemo(() => {
    if (!group) return [];
    const everyone = Array.from(new Set([...group.memberIds, ...Object.keys(group.memberNames ?? {})]));
    return suggestSettlements(computeBalances(everyone, expenses, settlements));
  }, [group, expenses, settlements]);

  if (group === undefined) return <Screen><Loading /></Screen>;
  if (!group || !group.memberIds.includes(me.uid)) return <TripUnavailable title="Settle Up" />;
  const name = (u: string) => memberName(group, u, me.uid);
  const pending = settlements.filter((s) => s.status === 'recorded');
  const history = settlements.filter((s) => s.status !== 'recorded');
  const remaining = transfers.reduce((a, t) => a + t.amount, 0);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setErr(null);
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Settle Up" subtitle={group.name} />
      <ErrorText text={err} />

      {transfers.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 6 }} testID="all-settled">
          <Ionicons name="checkmark-circle" size={44} color={colors.green} />
          <Text style={type.h2}>All settled up!</Text>
          <Text style={type.small}>Everyone&apos;s balance is ₹0.</Text>
        </Card>
      ) : (
        transfers.map((t) => {
          const key = `${t.fromUid}>${t.toUid}`;
          const mine = t.fromUid === me.uid || t.toUid === me.uid;
          const waiting = pending.find((s) => s.fromUid === t.fromUid && s.toUid === t.toUid);
          return (
            <Card key={key} style={{ marginBottom: 10, padding: 14 }} testID="transfer-row">
              <Row>
                <Avatar name={memberName(group, t.fromUid)} size={32} />
                <Text style={type.body}>{name(t.fromUid)}</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
                <Text style={[type.body, { flex: 1 }]}>{name(t.toUid)}</Text>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{formatMoney(t.amount)}</Text>
              </Row>
              {mine && !waiting && (
                <Button
                  small
                  testID="record-payment"
                  style={{ marginTop: 10 }}
                  title={t.fromUid === me.uid ? `I paid ${name(t.toUid)}` : `${name(t.fromUid)} paid me`}
                  icon="checkmark-done"
                  loading={busy === key}
                  onPress={() => run(key, () => recordSettlement(group, me, t.fromUid, t.toUid, t.amount, settlements))}
                />
              )}
              {waiting && <Text style={[type.tiny, { marginTop: 8, color: colors.yellow }]}>Payment recorded · waiting for {name(t.toUid)} to confirm</Text>}
            </Card>
          );
        })
      )}

      {transfers.length > 0 && (
        <Card style={{ marginTop: 6, alignItems: 'center' }}>
          <Text style={type.small}>
            {transfers.length} payment{transfers.length === 1 ? '' : 's'} remaining
          </Text>
          <Text style={[type.h2, { marginTop: 4 }]}>
            Total: <Text style={{ color: colors.green }}>{formatMoney(remaining)}</Text>
          </Text>
        </Card>
      )}

      {pending.length > 0 && (
        <>
          <SectionTitle title="Awaiting confirmation" />
          {pending.map((s) => (
            <Card key={s.id} style={{ marginBottom: 10, padding: 14 }} testID="pending-settlement">
              <Row>
                <Text style={[type.body, { flex: 1 }]}>
                  {name(s.fromUid)} → {name(s.toUid)}
                </Text>
                <Text style={{ color: '#fff', fontWeight: '800' }}>{formatMoney(s.amount)}</Text>
              </Row>
              <Text style={[type.tiny, { marginTop: 4 }]}>Recorded by {name(s.recordedBy)} · {timeAgo(s.createdAt)}</Text>
              {s.toUid === me.uid ? (
                <Row style={{ marginTop: 10 }}>
                  <Button small variant="ghost" title="Not received" style={{ flex: 1 }} disabled={!!busy} onPress={() => run(s.id, () => confirmSettlement(group, me, s, false))} />
                  <Button small testID="confirm-payment" variant="success" title="Mark as Settled" style={{ flex: 1 }} loading={busy === s.id} onPress={() => run(s.id, () => confirmSettlement(group, me, s, true))} />
                </Row>
              ) : (
                <Pill text={`Waiting for ${name(s.toUid)}`} color={colors.yellow} style={{ marginTop: 8 }} />
              )}
            </Card>
          ))}
        </>
      )}

      <SectionTitle title="Settlement history" />
      {history.length === 0 ? (
        <Empty icon="time-outline" title="No settlements yet" />
      ) : (
        history.map((s) => (
          <Row key={s.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.cardBorder }}>
            <Ionicons name={s.status === 'confirmed' ? 'checkmark-circle' : 'close-circle'} size={18} color={s.status === 'confirmed' ? colors.green : colors.red} />
            <View style={{ flex: 1 }}>
              <Text style={type.body}>
                {name(s.fromUid)} → {name(s.toUid)}
              </Text>
              <Text style={type.tiny}>
                {s.status === 'confirmed' ? 'Confirmed' : 'Not received'} by {name(s.confirmedBy ?? s.toUid)} · {timeAgo(s.confirmedAt ?? s.createdAt)}
              </Text>
            </View>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{formatMoney(s.amount)}</Text>
          </Row>
        ))
      )}
      <Text style={[type.tiny, { marginTop: 16 }]}>
        ROAM records and verifies payments between members; money is transferred outside the app (UPI, cash, bank).
      </Text>
    </Screen>
  );
}
