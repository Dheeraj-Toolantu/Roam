import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Appear } from '@/components/motion';
import { AvatarStack, Button, Card, Empty, ErrorText, Logo, Row, Screen, Segmented } from '@/components/ui';
import { CITY_BY_ID } from '@/data/cities';
import { tripDates } from '@/hooks/useTrip';
import { useMe } from '@/lib/session';
import { respondToInvite, subscribeMyGroups, subscribeMyInvites } from '@/services/crew';
import { errorMessage } from '@/services/util';
import { colors, radius, type } from '@/theme';
import type { Group, Invitation } from '@/types';

export default function Crew() {
  const me = useMe();
  const [tab, setTab] = useState<'crews' | 'invites'>('crews');
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => subscribeMyGroups(me.uid, setGroups), [me.uid]);
  useEffect(() => subscribeMyInvites(me.uid, setInvites), [me.uid]);

  const respond = async (inv: Invitation, accept: boolean) => {
    setErr(null);
    setBusy(inv.id);
    try {
      await respondToInvite(me, inv, accept);
      if (accept) router.push(`/trip/${inv.groupId}`);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Row style={{ marginBottom: 16 }}>
        <Logo size={30} />
        <Text style={[type.h1, { flex: 1 }]}>ROAM Crew</Text>
        <Button small title="New trip" icon="add" onPress={() => router.push('/trip/create')} testID="new-trip" />
      </Row>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: 'crews', label: 'My Crews' },
          { id: 'invites', label: `Invites${invites.length ? ` (${invites.length})` : ''}` },
        ]}
      />
      <View style={{ height: 16 }} />
      <ErrorText text={err} />

      {tab === 'crews' ? (
        groups === null ? (
          <Text style={type.small}>Loading…</Text>
        ) : groups.length === 0 ? (
          <Empty
            icon="people-outline"
            title="Travel better together"
            text="Create a group trip, invite friends, share a timeline and split expenses — all in one place."
            action={
              <View style={{ gap: 10, marginTop: 10, alignSelf: 'stretch' }}>
                <Button title="Create Group Trip" onPress={() => router.push('/trip/create')} />
                <Button title="Join with invite code" variant="secondary" onPress={() => router.push('/trip/join')} />
              </View>
            }
          />
        ) : (
          <>
            {groups.map((g, i) => (
              <Appear key={g.id} index={i}>
                <CrewCard g={g} />
              </Appear>
            ))}
            <Button title="Join with invite code" icon="key-outline" variant="secondary" onPress={() => router.push('/trip/join')} style={{ marginTop: 6 }} testID="join-with-code" />
          </>
        )
      ) : invites.length === 0 ? (
        <Empty icon="mail-open-outline" title="No pending invites" text="When friends invite you to a trip it will show up here." />
      ) : (
        invites.map((inv) => (
          <Card key={inv.id} style={{ marginBottom: 12 }} testID="invite-card">
            <Text style={type.h3}>{inv.groupName}</Text>
            <Text style={[type.small, { marginVertical: 4 }]}>
              {inv.fromName} invited you · {inv.destination || 'Group trip'}
            </Text>
            <Row style={{ marginTop: 10 }}>
              <Button small variant="ghost" title="Decline" onPress={() => respond(inv, false)} disabled={busy === inv.id} style={{ flex: 1 }} />
              <Button small title="Accept" onPress={() => respond(inv, true)} loading={busy === inv.id} style={{ flex: 1 }} testID="accept-invite" />
            </Row>
          </Card>
        ))
      )}
    </Screen>
  );
}

function CrewCard({ g }: { g: Group }) {
  const city = g.destinationCityId ? CITY_BY_ID[g.destinationCityId] : null;
  return (
    <Pressable onPress={() => router.push(`/trip/${g.id}`)} style={{ marginBottom: 14 }} testID="crew-card">
      <LinearGradient colors={[g.colors?.[0] ?? colors.orange, g.colors?.[1] ?? colors.pink, '#1B1838']} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1.3 }} style={{ borderRadius: radius.lg, padding: 18, minHeight: 150, justifyContent: 'space-between' }}>
        <View>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>
            {g.name} {city?.emoji ?? ''}
          </Text>
          <Text style={{ color: '#ffffffcc', marginTop: 2 }}>
            {g.destination || 'Destination TBD'} · {tripDates(g)}
          </Text>
        </View>
        <Row style={{ justifyContent: 'space-between', marginTop: 18 }}>
          <AvatarStack names={g.memberIds.map((u) => g.memberNames?.[u] ?? '?')} />
          <Row gap={4}>
            <Ionicons name="people" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700' }}>{g.memberIds.length}</Text>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </Row>
        </Row>
      </LinearGradient>
    </Pressable>
  );
}
