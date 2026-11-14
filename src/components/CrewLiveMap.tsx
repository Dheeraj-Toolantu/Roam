import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { formatKm, haversineKm } from '../logic/journey';
import { ago, isFresh } from '../logic/live';
import { liveShare, subscribeCrewLive, useIsSharing, type CrewLiveLocation } from '../services/liveShare';
import { useLiveLocation } from '../services/location';
import { errorMessage, initials } from '../services/util';
import { colors, type } from '../theme';
import type { Group, Journey, UserProfile } from '../types';
import { GoogleMap } from './GoogleMap';
import { Avatar, ErrorText, InfoText, Pill, Row, Toggle } from './ui';
import { CITY_BY_ID } from '../data/cities';

const PALETTE = [colors.violet, colors.orange, colors.green, colors.yellow, colors.blue];

/** Crew map: destination, journeys shared with the crew, and opt-in live member locations. */
export function CrewLiveMap({ group, me, journeys }: { group: Group; me: UserProfile; journeys: Journey[] }) {
  const sharing = useIsSharing(group.id);
  const loc = useLiveLocation({ live: true });
  const [live, setLive] = useState<CrewLiveLocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => subscribeCrewLive(group.id, setLive), [group.id]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const city = group.destinationCityId ? CITY_BY_ID[group.destinationCityId] : null;
  const others = live.filter((l) => l.uid !== me.uid && group.memberIds.includes(l.uid));
  const fresh = others.filter((l) => isFresh(l.updatedAt, now));

  const toggle = async (on: boolean) => {
    setErr(null);
    setBusy(true);
    try {
      if (on) await liveShare.enable(group, me);
      else await liveShare.disable(group.id);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <GoogleMap
        testID="crew-map"
        me={loc.fix ? { lat: loc.fix.lat, lng: loc.fix.lng, accuracy: loc.fix.accuracy } : null}
        routes={journeys.map((j, i) => ({ id: j.id, points: j.route ?? [], color: PALETTE[i % PALETTE.length] }))}
        markers={[
          ...(city ? [{ id: 'dest', lat: city.lat, lng: city.lng, title: city.name, description: 'Trip destination', color: colors.yellow }] : []),
          ...fresh.map((l) => ({ id: l.uid, lat: l.lat, lng: l.lng, title: l.name, description: `Live · ${ago(l.updatedAt, now)}`, color: colors.pink, label: initials(l.name) })),
        ]}
        center={city ? { lat: city.lat, lng: city.lng } : loc.fix}
        zoom={12}
        height={320}
      />

      <View style={{ marginTop: 12 }}>
        <Toggle
          testID="toggle-share-live"
          label={busy ? 'Updating…' : 'Share my live location with this crew'}
          hint={sharing ? `Members of ${group.name} can see where you are. Turn off any time.` : 'Off by default. Only members of this trip will see you.'}
          value={sharing}
          onChange={(v) => !busy && toggle(v)}
        />
        <ErrorText text={err} />
      </View>

      <Text style={[type.h3, { marginTop: 8, marginBottom: 6 }]}>Live now</Text>
      {sharing && (
        <Row style={{ paddingVertical: 6 }} gap={10}>
          <Avatar name={me.displayName} size={32} />
          <Text style={[type.body, { flex: 1 }]}>You</Text>
          <Pill text="Sharing" color={colors.green} icon="radio-button-on" />
        </Row>
      )}
      {others.length === 0 && !sharing ? (
        <Text style={type.small}>Nobody is sharing live location in this trip yet.</Text>
      ) : (
        others.map((l) => {
          const ok = isFresh(l.updatedAt, now);
          return (
            <Row key={l.uid} style={{ paddingVertical: 6 }} gap={10}>
              <Avatar name={l.name} size={32} />
              <View style={{ flex: 1 }}>
                <Text style={type.body} testID={`live-member-${initials(l.name)}`}>
                  {l.name}
                </Text>
                <Text style={type.tiny}>{ok ? `Live · ${ago(l.updatedAt, now)}` : `Last seen ${ago(l.updatedAt, now)}`}</Text>
              </View>
              {ok && loc.fix ? <Text style={{ color: colors.cyan, fontWeight: '700' }}>{formatKm(haversineKm(loc.fix, l))} away</Text> : <Pill text="Offline" color={colors.textDim} />}
            </Row>
          );
        })
      )}
      <View style={{ marginTop: 10 }}>
        <InfoText
          icon="shield-checkmark"
          text={`Live locations are visible only to trip members and only for people who turned sharing on. ${journeys.length} journey${journeys.length === 1 ? '' : 's'} shared with the crew shown as routes.`}
        />
      </View>
    </View>
  );
}
