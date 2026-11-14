import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { GoogleMap } from '@/components/GoogleMap';
import type { MapMarker } from '@/components/GoogleMap.types';
import { Avatar, Button, Card, Chip, Header, InfoText, Pill, Row, Screen, SectionTitle } from '@/components/ui';
import { useMe } from '@/lib/session';
import { formatKm, haversineKm } from '@/logic/journey';
import { ago, isFresh } from '@/logic/live';
import { subscribeMyGroups } from '@/services/crew';
import { subscribeMyJourneys } from '@/services/journeys';
import { liveLocation, nearbyCities, useLiveLocation } from '@/services/location';
import { subscribeCrewLive, type CrewLiveLocation } from '@/services/liveShare';
import { initials } from '@/services/util';
import { colors, type } from '@/theme';
import type { Group, Journey } from '@/types';

/** Live Map: the user's live position on Google Maps, active route, crew live locations, places nearby. */
export default function LiveMap() {
  const me = useMe();
  const loc = useLiveLocation({ live: true }); // continuous updates while this screen is open
  const [follow, setFollow] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [crewLive, setCrewLive] = useState<Record<string, (CrewLiveLocation & { groupName: string })[]>>({});
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => subscribeMyGroups(me.uid, setGroups), [me.uid]);
  useEffect(() => subscribeMyJourneys(me.uid, setJourneys), [me.uid]);
  useEffect(() => {
    const unsubs = groups.map((g) =>
      subscribeCrewLive(g.id, (list) => setCrewLive((m) => ({ ...m, [g.id]: list.map((l) => ({ ...l, groupName: g.name })) }))),
    );
    return () => unsubs.forEach((u) => u());
  }, [groups]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const active = journeys.find((j) => j.status !== 'completed');
  const fix = loc.fix;
  const friends = useMemo(() => {
    const byUid = new Map<string, CrewLiveLocation & { groupName: string }>();
    Object.values(crewLive)
      .flat()
      .filter((l) => l.uid !== me.uid && isFresh(l.updatedAt, now))
      .forEach((l) => {
        const prev = byUid.get(l.uid);
        if (!prev || prev.updatedAt < l.updatedAt) byUid.set(l.uid, l);
      });
    return [...byUid.values()];
  }, [crewLive, me.uid, now]);
  const nearby = fix ? nearbyCities(fix, 4) : [];

  const markers: MapMarker[] = [
    ...friends.map((f) => ({ id: `crew-${f.uid}`, lat: f.lat, lng: f.lng, title: f.name, description: `${f.groupName} · ${ago(f.updatedAt, now)}`, color: colors.pink, label: initials(f.name) })),
    ...nearby
      .filter((n) => n.km > 2)
      .map((n) => ({ id: `city-${n.city.id}`, lat: n.city.lat, lng: n.city.lng, title: n.city.name, description: formatKm(n.km), color: colors.yellow, onPress: () => router.push(`/city/${n.city.id}`) })),
  ];

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Live Map" subtitle="Powered by Google Maps" right={loc.live ? <Pill text="Live" color={colors.green} icon="radio-button-on" /> : undefined} />
      <GoogleMap
        testID="live-map"
        me={fix ? { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy } : null}
        followMe={follow}
        route={active?.route ?? []}
        markers={markers}
        center={fix}
        zoom={14}
        height={400}
      />
      <Row style={{ marginTop: 10 }}>
        <Chip label={follow ? 'Following me' : 'Follow me'} icon="locate" active={follow} onPress={() => setFollow(!follow)} testID="follow-me" />
        <Chip label="Refresh" icon="refresh" onPress={() => liveLocation.detect()} />
      </Row>

      <Card style={{ marginTop: 12 }} testID="current-location-card">
        <Row>
          <Ionicons name="navigate-circle" size={28} color={colors.cyan} />
          <View style={{ flex: 1 }}>
            <Text style={type.tiny}>You are here</Text>
            <Text style={type.h3} testID="current-place">
              {loc.place?.label ?? (loc.permission === 'denied' ? 'Location permission is off' : 'Detecting…')}
            </Text>
            {fix && (
              <Text style={type.tiny} testID="current-coords">
                {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)}
                {fix.accuracy ? ` · ±${Math.round(fix.accuracy)} m` : ''}
                {fix.speed && fix.speed > 0.5 ? ` · ${Math.round(fix.speed * 3.6)} km/h` : ''} · {ago(fix.timestamp, now)}
              </Text>
            )}
          </View>
        </Row>
        {!!loc.error && <InfoText text={loc.error} icon="warning" />}
        <View style={{ marginTop: 12 }}>
          {active ? (
            <Button small title={`Open “${active.title}”`} icon="navigate" onPress={() => router.push(`/journey/${active.id}`)} />
          ) : (
            <Button small title="Start a journey here" icon="play" onPress={() => router.push('/journey/start')} testID="start-here" />
          )}
        </View>
      </Card>

      <SectionTitle title="Crew live now" />
      {friends.length === 0 ? (
        <Text style={type.small}>
          No crew members are sharing right now. Live sharing is always opt-in — turn it on per trip from the trip&apos;s Map tab.
        </Text>
      ) : (
        friends.map((f) => (
          <Row key={f.uid} style={{ paddingVertical: 8 }} gap={10}>
            <Avatar name={f.name} size={34} />
            <View style={{ flex: 1 }}>
              <Text style={type.body} testID={`crew-live-${f.uid}`}>
                {f.name}
              </Text>
              <Text style={type.tiny}>
                {f.groupName} · updated {ago(f.updatedAt, now)}
              </Text>
            </View>
            {fix && <Text style={{ color: colors.cyan, fontWeight: '700' }}>{formatKm(haversineKm(fix, f))} away</Text>}
          </Row>
        ))
      )}

      {nearby.length > 0 && (
        <>
          <SectionTitle title="Destinations near you" />
          {nearby.map((n) => (
            <Card key={n.city.id} style={{ marginBottom: 8, padding: 12 }} onPress={() => router.push(`/city/${n.city.id}`)}>
              <Row>
                <Text style={{ fontSize: 22 }}>{n.city.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={type.h3}>{n.city.name}</Text>
                  <Text style={type.tiny}>{n.city.tagline}</Text>
                </View>
                <Text style={type.small}>{n.km < 2 ? 'You are here' : formatKm(n.km)}</Text>
              </Row>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
