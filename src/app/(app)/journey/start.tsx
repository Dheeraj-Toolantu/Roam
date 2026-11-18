import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BackgroundLocationCard } from '@/components/BackgroundLocationCard';
import { Button, Card, Chip, ErrorText, Field, Header, InfoText, Loading, Row, Screen } from '@/components/ui';
import { useMe } from '@/lib/session';
import { subscribeMyGroups } from '@/services/crew';
import { backgroundLocation } from '@/services/backgroundLocation';
import { getActiveJourney, getJourney, startJourney } from '@/services/journeys';
import { useLiveLocation } from '@/services/location';
import { tracker } from '@/services/tracker';
import { errorMessage } from '@/services/util';
import { colors, gradients, radius, type, onDark } from '@/theme';
import type { Group, Visibility } from '@/types';

const VIS: { id: Visibility; label: string; icon: 'lock-closed' | 'people' | 'people-circle' | 'earth' }[] = [
  { id: 'private', label: 'Only me', icon: 'lock-closed' },
  { id: 'followers', label: 'Followers', icon: 'people' },
  { id: 'crew', label: 'Crew', icon: 'people-circle' },
  { id: 'public', label: 'Public', icon: 'earth' },
];

export default function StartJourney() {
  const me = useMe();
  const params = useLocalSearchParams<{ groupId?: string }>();
  const [kind, setKind] = useState<'solo' | 'group'>(params.groupId ? 'group' : 'solo');
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState<string | null>(params.groupId ?? null);
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const here = useLiveLocation({ detect: true });
  // A trip is already running → no solo/group questions: go straight to adding to it.
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let alive = true;
    getActiveJourney(me.uid)
      .then((j) => {
        if (!alive) return;
        if (j) router.replace(`/capture?journeyId=${j.id}`);
        else setChecking(false);
      })
      .catch(() => alive && setChecking(false));
    return () => {
      alive = false;
    };
  }, [me.uid]);

  useEffect(() => subscribeMyGroups(me.uid, setGroups), [me.uid]);
  useEffect(() => {
    if (kind === 'group' && !groupId && groups[0]) setGroupId(groups[0].id);
  }, [kind, groups, groupId]);

  const go = async () => {
    setErr(null);
    if (kind === 'group' && !groupId) return setErr('Choose a crew trip, or create one in ROAM Crew first.');
    setBusy(true);
    try {
      // Ask for location permission before tracking begins (BR-002).
      const granted = await tracker.requestPermission();
      // If the user opted into background recording, ask for "Allow all the time" now (explained on this screen).
      if (granted && (await backgroundLocation.isSupported()) && (await backgroundLocation.isPreferred()) && (await backgroundLocation.permission()) === 'undetermined') {
        await backgroundLocation.requestPermission();
      }
      const g = groups.find((x) => x.id === groupId);
      const id = await startJourney(me, {
        title: title || (kind === 'group' && g ? g.name : 'My Journey'),
        type: kind,
        groupId: kind === 'group' ? groupId : null,
        visibility: kind === 'group' && visibility === 'private' ? 'crew' : visibility,
      });
      const j = await getJourney(id);
      if (j && granted) await tracker.start(j, { uid: me.uid, name: me.displayName, enabled: me.appearInLiveWorld });
      router.replace(`/journey/${id}`);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (checking)
    return (
      <Screen>
        <Header title="Start Your Journey" />
        <Loading />
      </Screen>
    );

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Start Your Journey" />
      <LinearGradient colors={['#1B1838', '#3F3774']} style={{ borderRadius: radius.lg, padding: 18, marginBottom: 18 }}>
        <Text style={[onDark.small, { color: '#ffffffe6', lineHeight: 20 }]}>
          ROAM will automatically track your locations, activities, photos and videos and create a cinematic story. Tracking is always visible
          and you can pause it any time.
        </Text>
      </LinearGradient>

      <Row gap={8} style={{ marginBottom: 16 }}>
        <Ionicons name="location" size={18} color={here.permission === 'denied' ? colors.red : colors.cyan} />
        <Text style={[type.small, { flex: 1 }]} testID="start-location">
          {here.place
            ? `Starting from ${here.place.label}`
            : here.permission === 'denied'
              ? 'Location permission is off — ROAM will ask again when you start.'
              : 'Detecting your current location…'}
        </Text>
      </Row>
      <Text style={[type.h3, { marginBottom: 10 }]}>Trip Type</Text>
      <View style={{ gap: 10, marginBottom: 18 }}>
        <TypeOption icon="person-outline" title="Solo Trip" subtitle="Just you and the road" on={kind === 'solo'} onPress={() => setKind('solo')} testID="type-solo" />
        <TypeOption icon="people-outline" title="Group Trip" subtitle="Create / Join Crew" on={kind === 'group'} onPress={() => setKind('group')} testID="type-group" />
      </View>

      {kind === 'group' && (
        <Card style={{ marginBottom: 18 }}>
          {groups.length === 0 ? (
            <View style={{ gap: 10 }}>
              <Text style={type.small}>You are not in any crew trips yet.</Text>
              <Button small title="Create a crew trip" variant="secondary" onPress={() => router.push('/trip/create')} />
            </View>
          ) : (
            <>
              <Text style={[type.small, { marginBottom: 8 }]}>Which crew trip?</Text>
              <Row style={{ flexWrap: 'wrap' }}>
                {groups.map((g) => (
                  <Chip key={g.id} label={g.name} active={groupId === g.id} onPress={() => setGroupId(g.id)} />
                ))}
              </Row>
              <Text style={[type.tiny, { marginTop: 10 }]}>
                Your journey stays yours. Joining a crew never shares your live location — you choose what to share with the group.
              </Text>
            </>
          )}
        </Card>
      )}

      <Field testID="journey-title" label="Journey title (optional)" value={title} onChangeText={setTitle} placeholder="Goa Trip 2026 🌴" />
      <Text style={[type.small, { fontWeight: '600', marginBottom: 8 }]}>Who can see this journey?</Text>
      <Row style={{ flexWrap: 'wrap', marginBottom: 8 }}>
        {VIS.filter((v) => v.id !== 'crew' || kind === 'group').map((v) => (
          <Chip key={v.id} testID={`start-vis-${v.id}`} label={v.label} icon={v.icon} active={visibility === v.id} onPress={() => setVisibility(v.id)} />
        ))}
      </Row>
      <BackgroundLocationCard />
      <InfoText text="Your precise GPS route is always private. Only cities and the moments you choose to share are visible to others." icon="shield-checkmark" />
      <ErrorText text={err} />
      <Button testID="start-journey" title="Start Journey" iconRight="arrow-forward" onPress={go} loading={busy} style={{ marginTop: 12 }} />
    </Screen>
  );
}

function TypeOption({ icon, title, subtitle, on, onPress, testID }: { icon: 'person-outline' | 'people-outline'; title: string; subtitle: string; on: boolean; onPress: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="radio" accessibilityState={{ checked: on }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 16,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: on ? colors.cyan : colors.cardBorder,
          backgroundColor: on ? colors.cyan + '14' : colors.card,
        }}>
        <LinearGradient colors={on ? gradients.brand : [colors.cardAlt, colors.cardAlt]} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={20} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={type.h3}>{title}</Text>
          <Text style={type.small}>{subtitle}</Text>
        </View>
        <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.cyan : colors.textDim} />
      </View>
    </Pressable>
  );
}
