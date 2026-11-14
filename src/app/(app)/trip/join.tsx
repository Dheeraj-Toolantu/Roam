import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Button, ErrorText, Field, Header, Screen } from '@/components/ui';
import { useMe } from '@/lib/session';
import { joinWithCode } from '@/services/crew';
import { errorMessage } from '@/services/util';
import { type } from '@/theme';

export default function JoinTrip() {
  const me = useMe();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(params.code ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const join = async () => {
    setErr(null);
    if (code.trim().length < 6) return setErr('Enter the invite code or paste the invite link');
    setBusy(true);
    try {
      const id = await joinWithCode(me, code);
      router.replace(`/trip/${id}`);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Join a Crew" subtitle="Use an invite code or link" />
      <Text style={[type.small, { marginBottom: 16 }]}>Ask a member to share the trip&apos;s invite link or 8-character code.</Text>
      <Field testID="join-code" value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="ABCD2345 or https://roam.app/join/…" autoCapitalize="characters" icon="key-outline" onSubmitEditing={join} />
      <ErrorText text={err} />
      <Button testID="join-submit" title="Join Trip" onPress={join} loading={busy} />
    </Screen>
  );
}
