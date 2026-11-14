import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Button, Card, Chip, ErrorText, Field, Header, InfoText, Loading, Row, Screen, goBackOr } from '@/components/ui';
import { memberName, useTripMoney } from '@/hooks/useTrip';
import { TripUnavailable } from '@/components/TripUnavailable';
import { useMe } from '@/lib/session';
import { allocate, EXPENSE_CATEGORIES, formatMoney, SPLIT_METHODS, SplitError, toMinor, type ExpenseCategory, type SplitMethod } from '@/logic/split';
import { pickMedia, uploadMedia } from '@/services/media';
import { addExpense, updateExpense } from '@/services/split';
import { errorMessage, randomId } from '@/services/util';
import { colors, radius, type } from '@/theme';

const today = () => new Date().toISOString().slice(0, 10);

export default function AddExpense() {
  const { id, expenseId } = useLocalSearchParams<{ id: string; expenseId?: string }>();
  const me = useMe();
  const { group, expenses } = useTripMoney(id, me.uid);
  const editing = expenseId ? expenses.find((e) => e.id === expenseId) : undefined;
  // One idempotency key per form: double taps / retries can't create duplicates.
  const requestId = useRef(randomId()).current;

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [payerId, setPayerId] = useState(me.uid);
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [method, setMethod] = useState<SplitMethod>('equal');
  const [selected, setSelected] = useState<string[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(today());
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (group && !selected.length && !editing) setSelected(group.memberIds);
  }, [group, selected.length, editing]);

  useEffect(() => {
    if (!editing || prefilled) return;
    setTitle(editing.title);
    setAmount(String(editing.amount / 100));
    setPayerId(editing.payerId);
    setCategory(editing.category);
    setMethod(editing.splitMethod);
    setSelected(Object.keys(editing.participants));
    setNotes(editing.notes);
    setDate(editing.date);
    setReceipt(editing.receiptUrl);
    if (editing.splitMethod === 'unequal') setInputs(Object.fromEntries(Object.entries(editing.participants).map(([k, v]) => [k, String(v / 100)])));
    if (editing.splitMethod === 'percentage')
      setInputs(Object.fromEntries(Object.entries(editing.participants).map(([k, v]) => [k, String(Math.round((v / editing.amount) * 10000) / 100)])));
    setPrefilled(true);
  }, [editing, prefilled]);

  const total = toMinor(amount || '0');
  const memberIds = group?.memberIds;
  const participants = useMemo(() => (method === 'equal' ? (memberIds ?? []) : selected), [method, memberIds, selected]);

  const preview = useMemo(() => {
    if (!group || !total || Number.isNaN(total)) return { alloc: null as Record<string, number> | null, error: null as string | null, remaining: null as string | null };
    const parsed: Record<string, number> = {};
    for (const u of participants) {
      const raw = inputs[u] ?? '';
      parsed[u] = method === 'unequal' ? toMinor(raw || '0') : Number(raw || '0');
    }
    let remaining: string | null = null;
    if (method === 'unequal') remaining = formatMoney(total - Object.values(parsed).reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0));
    if (method === 'percentage') remaining = `${Math.round((100 - Object.values(parsed).reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0)) * 100) / 100}%`;
    try {
      return { alloc: allocate(total, method, participants, parsed, method === 'personal' ? me.uid : payerId), error: null, remaining };
    } catch (e) {
      return { alloc: null, error: e instanceof SplitError ? e.message : String(e), remaining };
    }
  }, [group, total, method, participants, inputs, payerId, me.uid]);

  if (group === undefined) return <Screen><Loading /></Screen>;
  if (!group || !group.memberIds.includes(me.uid)) return <TripUnavailable title="Add Expense" />;
  if (expenseId && !editing) return <Screen><Loading label="Loading expense…" /></Screen>;

  const toggle = (u: string) => setSelected((s) => (s.includes(u) ? s.filter((x) => x !== u) : [...s, u]));

  const save = async () => {
    setErr(null);
    if (!title.trim()) return setErr('Add a title, e.g. Dinner @ Thalassa');
    if (!total || Number.isNaN(total) || total <= 0) return setErr('Enter a valid amount');
    if (preview.error) return setErr(preview.error);
    const parsed: Record<string, number> = {};
    for (const u of participants) parsed[u] = method === 'unequal' ? toMinor(inputs[u] || '0') : Number(inputs[u] || '0');
    setBusy(true);
    try {
      const draft = { title, amount: total, payerId: method === 'personal' ? me.uid : payerId, category, splitMethod: method, participantIds: participants, inputs: parsed, notes, date, receiptUrl: receipt };
      if (editing) await updateExpense(group, me, editing.id, draft);
      else await addExpense(group, me, draft, requestId);
      goBackOr(`/trip/${id}/split`);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={editing ? 'Edit Expense' : 'Add Expense'} subtitle={group.name} />
      <Field testID="expense-title" label="What was it for?" value={title} onChangeText={setTitle} placeholder="Dinner @ Thalassa" maxLength={80} />
      <Field testID="expense-amount" label="Amount (₹)" value={amount} onChangeText={setAmount} placeholder="2500" keyboardType="decimal-pad" icon="cash-outline" inputStyle={{ fontSize: 22, fontWeight: '800' }} />
      <Row gap={10}>
        <Field style={{ flex: 1 }} label="Date" value={date} onChangeText={setDate} placeholder="2026-11-20" icon="calendar-outline" />
      </Row>

      <Text style={[type.small, { fontWeight: '600', marginBottom: 8 }]}>Category</Text>
      <Row style={{ flexWrap: 'wrap', marginBottom: 14 }}>
        {EXPENSE_CATEGORIES.map((c) => (
          <Chip key={c.id} label={c.label} icon={c.icon as never} active={category === c.id} onPress={() => setCategory(c.id)} />
        ))}
      </Row>

      <Text style={[type.small, { fontWeight: '600', marginBottom: 8 }]}>Split method</Text>
      <Row style={{ flexWrap: 'wrap', marginBottom: 6 }}>
        {SPLIT_METHODS.map((m) => (
          <Chip key={m.id} label={m.label} active={method === m.id} onPress={() => setMethod(m.id)} testID={`method-${m.id}`} />
        ))}
      </Row>
      <Text style={[type.tiny, { marginBottom: 14 }]}>{SPLIT_METHODS.find((m) => m.id === method)?.hint}</Text>

      {method !== 'personal' && (
        <>
          <Text style={[type.small, { fontWeight: '600', marginBottom: 8 }]}>Paid by</Text>
          <Row style={{ flexWrap: 'wrap', marginBottom: 14 }}>
            {group.memberIds.map((u) => (
              <Chip key={u} label={memberName(group, u, me.uid)} active={payerId === u} onPress={() => setPayerId(u)} testID={`payer-${u}`} />
            ))}
          </Row>

          <Card style={{ marginBottom: 14 }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={type.h3}>Participants</Text>
              {preview.remaining && (method === 'unequal' || method === 'percentage') && (
                <Text style={{ color: preview.remaining.startsWith('₹0') || preview.remaining === '0%' ? colors.green : colors.yellow, fontWeight: '700' }}>
                  Remaining {preview.remaining}
                </Text>
              )}
            </Row>
            {group.memberIds.map((u) => {
              const on = participants.includes(u);
              return (
                <Row key={u} style={{ paddingVertical: 6 }}>
                  <Pressable
                    disabled={method === 'equal'}
                    onPress={() => toggle(u)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    testID={`participant-${u}`}>
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.cyan : colors.textDim} />
                    <Text style={type.body}>{memberName(group, u, me.uid)}</Text>
                  </Pressable>
                  {on && (method === 'unequal' || method === 'percentage') ? (
                    <Field
                      style={{ width: 110, marginBottom: 0 }}
                      value={inputs[u] ?? ''}
                      onChangeText={(t) => setInputs((s) => ({ ...s, [u]: t }))}
                      placeholder={method === 'unequal' ? '₹' : '%'}
                      keyboardType="decimal-pad"
                      testID={`share-${u}`}
                    />
                  ) : (
                    <Text style={type.small}>{on && preview.alloc?.[u] != null ? formatMoney(preview.alloc[u]) : ''}</Text>
                  )}
                </Row>
              );
            })}
            {method === 'equal' && <Text style={[type.tiny, { marginTop: 6 }]}>Tap “Selective” to choose specific people.</Text>}
          </Card>
        </>
      )}

      {method === 'personal' && (
        <View style={{ marginBottom: 14 }}>
          <InfoText text="Personal expenses are only visible in your totals and do not affect anyone's balance." icon="person" />
        </View>
      )}

      <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />

      <Text style={[type.small, { fontWeight: '600', marginBottom: 8 }]}>Receipt (optional)</Text>
      {receipt ? (
        <View style={{ marginBottom: 14 }}>
          <Image source={{ uri: receipt }} style={{ width: '100%', height: 160, borderRadius: radius.md }} contentFit="cover" />
          <Button small variant="ghost" title="Remove receipt" onPress={() => setReceipt(null)} style={{ marginTop: 8 }} />
        </View>
      ) : (
        <Button
          small
          variant="secondary"
          icon="receipt-outline"
          title="Attach receipt photo"
          style={{ marginBottom: 6 }}
          onPress={async () => {
            try {
              const m = await pickMedia('library', 'images');
              if (m) setReceipt(await uploadMedia(me.uid, m, 'receipts'));
            } catch (e) {
              setErr(errorMessage(e));
            }
          }}
        />
      )}
      <Text style={[type.tiny, { marginBottom: 14 }]}>Receipts are for reference — ROAM never creates obligations from a scanned receipt without your confirmation.</Text>

      {!!preview.error && total > 0 && <ErrorText text={preview.error} />}
      <ErrorText text={err} />
      <Button testID="save-expense" title={editing ? 'Save changes' : `Add ${total > 0 ? formatMoney(total) : 'expense'}`} onPress={save} loading={busy} variant="purple" />
    </Screen>
  );
}
