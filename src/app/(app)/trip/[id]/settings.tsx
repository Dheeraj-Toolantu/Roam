import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { confirmAsync, toast } from '@/components/PostCard';
import { Avatar, Button, Card, ErrorText, Field, Header, InfoText, Loading, Pill, Row, Screen, SectionTitle, Toggle } from '@/components/ui';
import { memberName, useGroup } from '@/hooks/useTrip';
import { TripUnavailable } from '@/components/TripUnavailable';
import { useMe } from '@/lib/session';
import { formatMoney, toMinor } from '@/logic/split';
import { leaveGroup, removeMember, setAdmin, setVideoExcluded, updateGroup } from '@/services/crew';
import { errorMessage } from '@/services/util';
import { colors, type } from '@/theme';

export default function TripSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const group = useGroup(id);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [budget, setBudget] = useState('');
  const [alertPct, setAlertPct] = useState('80');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!group || loaded) return;
    setName(group.name);
    setDescription(group.description);
    setStart(group.startDate);
    setEnd(group.endDate);
    setBudget(group.budget ? String(group.budget / 100) : '');
    setAlertPct(String(group.budgetAlertPct ?? 80));
    setLoaded(true);
  }, [group, loaded]);

  if (group === undefined) return <Screen><Loading /></Screen>;
  if (!group || !group.memberIds.includes(me.uid)) return <TripUnavailable title="Trip Settings" />;
  const isAdmin = group.adminIds.includes(me.uid);
  const excluded = group.videoExcludedUids?.includes(me.uid) ?? false;

  const save = async () => {
    setErr(null);
    const b = budget.trim() ? toMinor(budget) : 0;
    const pct = Number(alertPct);
    if (Number.isNaN(b) || b < 0) return setErr('Budget must be a positive amount');
    if (!(pct > 0 && pct <= 100)) return setErr('Alert threshold must be between 1 and 100%');
    if (!name.trim()) return setErr('Trip name is required');
    setBusy(true);
    try {
      await updateGroup(group.id, { name: name.trim(), description: description.trim(), startDate, endDate, budget: b, budgetAlertPct: pct });
      toast('Trip updated');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<void>) => {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Trip Settings" subtitle={group.name} />
      <ErrorText text={err} />

      <Card>
        <Toggle
          testID="toggle-video-contribution"
          label="Include my photos & videos in the group video"
          hint="Turn off to exclude your contributions from the ROAM Magic group video."
          value={!excluded}
          onChange={(v) => act(() => setVideoExcluded(group, me.uid, !v))}
        />
        <InfoText icon="shield-checkmark" text="Your live location is never shared with the crew. Share a journey with the crew explicitly if you want it on the group map." />
      </Card>

      {isAdmin ? (
        <>
          <SectionTitle title="Trip details" />
          <Field label="Name" value={name} onChangeText={setName} />
          <Field label="Description" value={description} onChangeText={setDescription} multiline />
          <Row gap={10}>
            <Field style={{ flex: 1 }} label="Start" value={startDate} onChangeText={setStart} placeholder="2026-11-20" />
            <Field style={{ flex: 1 }} label="End" value={endDate} onChangeText={setEnd} placeholder="2026-11-24" />
          </Row>
          <SectionTitle title="Budget" />
          <Row gap={10}>
            <Field testID="settings-budget" style={{ flex: 2 }} label="Group budget (₹)" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholder="50000" />
            <Field style={{ flex: 1 }} label="Alert at %" value={alertPct} onChangeText={setAlertPct} keyboardType="number-pad" />
          </Row>
          {group.budget > 0 && <Text style={[type.tiny, { marginTop: -6, marginBottom: 10 }]}>Current budget: {formatMoney(group.budget)}</Text>}
          <Button testID="trip-settings-save" title="Save changes" onPress={save} loading={busy} />
        </>
      ) : (
        <Text style={[type.small, { marginTop: 16 }]}>Only trip admins can edit details and budget.</Text>
      )}

      <SectionTitle title={`Members (${group.memberIds.length})`} />
      {group.memberIds.map((u) => (
        <Card key={u} style={{ marginBottom: 8, padding: 12 }}>
          <Row>
            <Avatar name={memberName(group, u)} size={34} />
            <Text style={[type.body, { flex: 1 }]}>{memberName(group, u, me.uid)}</Text>
            {u === group.ownerId ? <Pill text="Owner" color={colors.yellow} /> : group.adminIds.includes(u) ? <Pill text="Admin" color={colors.cyan} /> : null}
          </Row>
          {isAdmin && u !== me.uid && u !== group.ownerId && (
            <Row style={{ marginTop: 10 }}>
              <Button small variant="ghost" title={group.adminIds.includes(u) ? 'Remove admin' : 'Make admin'} onPress={() => act(() => setAdmin(group, u, !group.adminIds.includes(u)))} />
              <Button
                small
                variant="danger"
                title="Remove"
                onPress={async () => {
                  if (await confirmAsync('Remove member?', `${memberName(group, u)} will lose access to this trip. Their expenses stay in the records.`, 'Remove'))
                    await act(() => removeMember(group, u));
                }}
              />
            </Row>
          )}
        </Card>
      ))}

      <SectionTitle title="Invite code" />
      <Text style={{ color: colors.cyan, fontWeight: '900', fontSize: 22, letterSpacing: 4 }} selectable>
        {group.inviteCode}
      </Text>

      <View style={{ height: 24 }} />
      {group.ownerId !== me.uid ? (
        <Button
          testID="leave-trip"
          variant="danger"
          icon="exit-outline"
          title="Leave trip"
          onPress={async () => {
            if (!(await confirmAsync('Leave this trip?', 'You will lose access to the timeline. Expense records you are part of are kept so balances stay correct.', 'Leave'))) return;
            await act(async () => {
              await leaveGroup(me.uid, group);
              router.replace('/crew');
            });
          }}
        />
      ) : (
        <Text style={type.tiny}>You own this trip. Owners can&apos;t leave their own trip.</Text>
      )}
    </Screen>
  );
}
