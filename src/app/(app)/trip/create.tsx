import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Button, Chip, ErrorText, Field, Header, Row, Screen } from '@/components/ui';
import { CITIES } from '@/data/cities';
import { useMe } from '@/lib/session';
import { toMinor } from '@/logic/split';
import { createGroup } from '@/services/crew';
import { errorMessage } from '@/services/util';
import { type } from '@/theme';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function CreateTrip() {
  const me = useMe();
  const params = useLocalSearchParams<{ destination?: string }>();
  const [name, setName] = useState('');
  const [destination, setDestination] = useState(params.destination ?? '');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [budget, setBudget] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setErr(null);
    if (!name.trim()) return setErr('Give your trip a name, e.g. Goa Trip 2026');
    if ((startDate && !DATE.test(startDate)) || (endDate && !DATE.test(endDate))) return setErr('Use dates like 2026-11-20');
    const b = budget.trim() ? toMinor(budget) : 0;
    if (Number.isNaN(b) || b < 0) return setErr('Budget must be a positive amount');
    setBusy(true);
    try {
      const id = await createGroup(me, { name, destination, description, startDate, endDate: endDate || startDate, visibility, budget: b });
      router.replace(`/trip/${id}`);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Create Group Trip" subtitle="ROAM CREW" />
      <Field testID="trip-name" label="Trip name" value={name} onChangeText={setName} placeholder="Goa Trip 2026 🌴" maxLength={60} />
      <Field testID="trip-destination" label="Destination" value={destination} onChangeText={setDestination} placeholder="Goa" icon="location-outline" />
      <Row style={{ flexWrap: 'wrap', marginTop: -4, marginBottom: 12 }}>
        {CITIES.slice(0, 8).map((c) => (
          <Chip key={c.id} label={`${c.emoji} ${c.name}`} active={destination === c.name} onPress={() => setDestination(c.name)} />
        ))}
      </Row>
      <Row gap={10}>
        <Field testID="trip-start" style={{ flex: 1 }} label="Start date" value={startDate} onChangeText={setStart} placeholder="2026-11-20" autoCapitalize="none" />
        <Field testID="trip-end" style={{ flex: 1 }} label="End date" value={endDate} onChangeText={setEnd} placeholder="2026-11-24" autoCapitalize="none" />
      </Row>
      <Field label="Description" value={description} onChangeText={setDescription} placeholder="Beaches, forts and seafood!" multiline />
      <Field testID="trip-budget" label="Group budget (optional)" value={budget} onChangeText={setBudget} placeholder="₹ 50,000" keyboardType="decimal-pad" icon="wallet-outline" />
      <Text style={[type.small, { fontWeight: '600', marginBottom: 8 }]}>Trip visibility</Text>
      <Row style={{ marginBottom: 6 }}>
        <Chip label="Private" icon="lock-closed" active={visibility === 'private'} onPress={() => setVisibility('private')} />
        <Chip label="Public" icon="earth" active={visibility === 'public'} onPress={() => setVisibility('public')} />
      </Row>
      <Text style={[type.tiny, { marginBottom: 14 }]}>
        Trip activities are only visible to members. Members never share live location automatically.
      </Text>
      <ErrorText text={err} />
      <Button testID="create-trip" title="Create Trip" icon="people" onPress={save} loading={busy} />
    </Screen>
  );
}
