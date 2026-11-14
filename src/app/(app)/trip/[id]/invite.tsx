import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Share, Text, View } from 'react-native';

import { Button, Card, ErrorText, Field, Header, InfoText, Loading, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { useGroup } from '@/hooks/useTrip';
import { TripUnavailable } from '@/components/TripUnavailable';
import { useMe } from '@/lib/session';
import { inviteByUsername, inviteLink, subscribeGroupInvites } from '@/services/crew';
import { errorMessage } from '@/services/util';
import { colors, type } from '@/theme';
import type { Invitation } from '@/types';

export default function Invite() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const group = useGroup(id);
  const [username, setUsername] = useState('');
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => subscribeGroupInvites(id, setInvites), [id]);

  if (group === undefined) return <Screen><Loading /></Screen>;
  if (!group || !group.memberIds.includes(me.uid)) return <TripUnavailable title="Invite Friends" />;
  const link = inviteLink(group);
  const message = `Join my ROAM trip “${group.name}”${group.destination ? ` to ${group.destination}` : ''}! ${link} (code ${group.inviteCode})`;

  const send = async () => {
    setErr(null);
    setOk(null);
    if (!username.trim()) return setErr('Enter a ROAM username');
    setBusy(true);
    try {
      const u = await inviteByUsername(me, group, username);
      setOk(`Invitation sent to ${u.displayName}`);
      setUsername('');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Invite Friends" subtitle={group.name} />
      <Card>
        <Text style={[type.h3, { marginBottom: 10 }]}>Invite by username</Text>
        <Field testID="invite-username" icon="at" placeholder="username" value={username} onChangeText={(t) => setUsername(t.toLowerCase())} autoCapitalize="none" onSubmitEditing={send} />
        <ErrorText text={err} />
        {!!ok && <InfoText text={ok} icon="checkmark-circle" />}
        <Button testID="invite-send" title="Send invite" icon="paper-plane" onPress={send} loading={busy} />
      </Card>

      <Card style={{ marginTop: 14 }}>
        <Text style={type.h3}>Invite link & code</Text>
        <Text style={[type.small, { marginTop: 6 }]} selectable>
          {link}
        </Text>
        <View style={{ alignItems: 'center', marginVertical: 16 }}>
          <Text style={{ color: colors.cyan, fontSize: 32, fontWeight: '900', letterSpacing: 6 }} selectable testID="invite-code">
            {group.inviteCode}
          </Text>
          <Text style={type.tiny}>Friends can enter this code in Crew → Join with code</Text>
        </View>
        <Row>
          <Button style={{ flex: 1 }} small variant="success" icon="logo-whatsapp" title="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`).catch(() => {})} />
          <Button style={{ flex: 1 }} small variant="secondary" icon="share-outline" title="Share link" onPress={() => Share.share({ message }).catch(() => {})} />
        </Row>
      </Card>

      <SectionTitle title="Invitations" />
      {invites.length === 0 ? (
        <Text style={type.small}>No invitations sent yet.</Text>
      ) : (
        invites.map((i) => (
          <Row key={i.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.cardBorder }}>
            <Text style={[type.body, { flex: 1 }]}>{group.memberNames[i.toUid] ?? 'Invited traveller'}</Text>
            <Pill text={i.status} color={i.status === 'accepted' ? colors.green : i.status === 'rejected' ? colors.red : colors.yellow} />
          </Row>
        ))
      )}
    </Screen>
  );
}
