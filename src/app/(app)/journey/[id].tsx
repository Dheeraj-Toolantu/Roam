import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ActivityComposer } from '@/components/ActivityComposer';
import { RouteMap } from '@/components/maps';
import { confirmAsync, toast } from '@/components/PostCard';
import { ActivityTimeline } from '@/components/Timeline';
import { Button, Card, Chip, Empty, ErrorText, Field, Header, IconButton, InfoText, Loading, Pill, Row, Screen, SectionTitle, Stat } from '@/components/ui';
import { CITY_BY_ID } from '@/data/cities';
import { useMe } from '@/lib/session';
import { activeDurationMs, formatDuration, formatDurationShort, formatKm } from '@/logic/journey';
import {
  clearLocationHistory,
  deleteActivity,
  deleteJourney,
  end,
  pause,
  resume,
  subscribeActivities,
  subscribeJourney,
  updateActivity,
  updateJourney,
} from '@/services/journeys';
import { createPost } from '@/services/social';
import { tracker, type TrackerState } from '@/services/tracker';
import { errorMessage } from '@/services/util';
import { colors, radius, type } from '@/theme';
import type { Activity, Journey, Visibility } from '@/types';

export default function JourneyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const [j, setJ] = useState<Journey | null | undefined>(undefined);
  const [acts, setActs] = useState<Activity[]>([]);
  const [t, setT] = useState<TrackerState>(tracker.snapshot);
  const [now, setNow] = useState(() => Date.now());
  const [composer, setComposer] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => subscribeJourney(id, setJ), [id]);
  useEffect(() => subscribeActivities(id, setActs), [id]);
  useEffect(() => tracker.subscribe(setT), []);
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const mine = j?.ownerId === me.uid;
  // Keep tracker running while the journey is active (resumes after app restart).
  useEffect(() => {
    if (!j || !mine) return;
    tracker.updateJourney(j);
    if (j.status === 'active' && !(tracker.snapshot.running && tracker.snapshot.journeyId === j.id)) {
      void tracker.start(j, { uid: me.uid, name: me.displayName, enabled: me.appearInLiveWorld });
    }
  }, [j, mine, me.uid, me.displayName, me.appearInLiveWorld]);

  if (j === undefined) return <Screen><Loading /></Screen>;
  if (j === null)
    return (
      <Screen>
        <Header title="Journey" />
        <Empty icon="lock-closed-outline" title="Journey not available" text="It may have been deleted or is private." />
      </Screen>
    );

  const run = async (fn: () => Promise<void>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const doPause = () => run(async () => { await tracker.stop(); await pause(j); });
  const doResume = () => run(async () => { await resume(j); });
  const doEnd = async () => {
    if (!(await confirmAsync('End journey?', 'ROAM will stop tracking and prepare your cinematic story.', 'End journey'))) return;
    await run(async () => {
      await tracker.stop();
      await end(j);
      tracker.dismissEndSuggestion();
    });
  };

  const live = j.status !== 'completed';
  const duration = activeDurationMs(j, now);
  const km = j.distanceKm + (t.journeyId === j.id ? t.pendingKm : 0);
  const current = t.journeyId === j.id && t.lastFix ? t.lastFix : j.lastPoint;
  const placePins = acts
    .filter((a) => a.lat != null && a.lng != null && a.type !== 'start' && a.type !== 'end')
    .map((a) => ({ lat: a.lat!, lng: a.lng!, color: a.type === 'photo' ? colors.cyan : colors.pink }));
  const anchor = j.anchorCityId ? CITY_BY_ID[j.anchorCityId] : null;
  const route = j.route?.length ? j.route : anchor ? [anchor] : [];

  return (
    <Screen edges={['top', 'bottom']}>
      <Header
        title={j.cities.length ? j.cities.join(' · ') : j.title}
        subtitle={j.cities.length ? j.title : j.type === 'group' ? 'Group journey' : 'Solo journey'}
        right={
          live ? (
            <Pill text={j.status === 'paused' ? 'Paused' : 'Recording'} color={j.status === 'paused' ? colors.yellow : colors.green} icon={j.status === 'paused' ? 'pause' : 'radio-button-on'} />
          ) : (
            <Pill text="Completed" color={colors.violet} icon="checkmark-circle" />
          )
        }
      />

      {route.length || current ? (
        <RouteMap route={route} pins={placePins} current={live ? current : null} height={live ? 280 : 220} />
      ) : (
        <View style={{ height: 180, borderRadius: radius.lg, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Ionicons name="navigate-circle-outline" size={40} color={colors.cyan} />
          <Text style={type.small}>{live ? 'Waiting for your first GPS fix…' : 'No route recorded'}</Text>
        </View>
      )}

      {mine && live && t.error && <InfoText text={t.error} icon="warning" />}
      {mine && live && t.suggestEnd && (
        <Card style={{ marginTop: 12, borderColor: colors.yellow }}>
          <Text style={type.h3}>Looks like you&apos;ve left {anchor?.name ?? 'the city'}</Text>
          <Text style={[type.small, { marginVertical: 8 }]}>Would you like to end this journey?</Text>
          <Row>
            <Button small title="Keep tracking" variant="ghost" onPress={() => tracker.dismissEndSuggestion()} />
            <Button small title="End journey" onPress={doEnd} />
          </Row>
        </Card>
      )}

      <Card style={{ marginTop: 14 }}>
        {live && (
          <Row style={{ marginBottom: 14 }}>
            <Ionicons name="time-outline" size={20} color={colors.cyan} />
            <View>
              <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }} testID="journey-timer">
                {formatDuration(duration)}
              </Text>
              <Text style={type.tiny}>{j.status === 'paused' ? 'Journey paused' : 'Journey active'}</Text>
            </View>
          </Row>
        )}
        <Row>
          <Stat icon="location-outline" value={j.placesCount} label="Places" />
          <Stat icon="image-outline" value={j.photos} label="Photos" />
          <Stat icon="videocam-outline" value={j.videos} label="Videos" />
          <Stat icon="navigate-outline" value={formatKm(km)} label="Travelled" />
          {!live && <Stat icon="time-outline" value={formatDurationShort(duration)} label="Duration" />}
        </Row>
        {!live && (
          <Row style={{ marginTop: 12 }}>
            <Stat value={j.cities.length} label="Cities" />
            <Stat value={j.countries.length} label="Countries" />
            <Stat value={j.activitiesCount} label="Activities" />
          </Row>
        )}
      </Card>

      <ErrorText text={err} />

      {mine && live && (
        <>
          <Row style={{ justifyContent: 'center', marginTop: 18 }} gap={22}>
            {j.status === 'active' ? (
              <IconButton icon="pause" size={26} onPress={doPause} style={{ width: 58, height: 58, borderRadius: 29 }} accessibilityLabel="Pause journey" />
            ) : (
              <IconButton icon="play" size={26} color={colors.green} onPress={doResume} style={{ width: 58, height: 58, borderRadius: 29 }} accessibilityLabel="Resume journey" />
            )}
            <Pressable onPress={() => router.push(`/capture?journeyId=${j.id}`)} accessibilityLabel="Capture moment" testID="journey-capture">
              <LinearGradient colors={['#F43F5E', '#EF4444']} style={{ width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#ffffff33' }}>
                <Ionicons name="camera" size={32} color="#fff" />
              </LinearGradient>
            </Pressable>
            <IconButton icon="stop" size={24} color={colors.red} onPress={doEnd} style={{ width: 58, height: 58, borderRadius: 29 }} accessibilityLabel="End journey" />
          </Row>
          <Text style={[type.tiny, { textAlign: 'center', marginTop: 8 }]}>{busy ? 'Saving…' : 'Pause · Capture · End'}</Text>
        </>
      )}

      {!live && mine && (
        <View style={{ gap: 10, marginTop: 16 }}>
          <Button testID="make-magic" title="Create ROAM Magic Video" icon="sparkles" variant="purple" onPress={() => router.push(`/magic?journeyId=${j.id}`)} />
          <Button
            title="Share as travel story"
            icon="share-social-outline"
            variant="secondary"
            onPress={() =>
              run(async () => {
                await createPost(me, {
                  text: `${j.title}: ${j.cities.join(', ') || 'a new adventure'} · ${formatKm(j.distanceKm)} · ${j.photos} photos · ${j.placesCount} places`,
                  visibility: me.defaultPostVisibility === 'private' ? 'followers' : me.defaultPostVisibility,
                  city: j.cities[0] ?? null,
                  journeyId: j.id,
                  mediaUrl: j.coverUrl,
                  mediaType: j.coverUrl ? 'image' : null,
                  kind: 'story',
                });
                toast('Shared to your feed');
              })
            }
          />
        </View>
      )}

      <SectionTitle title="Timeline" action={mine ? (composer ? undefined : '+ Add activity') : undefined} onAction={() => setComposer(true)} />
      {composer && <ActivityComposer journey={j} me={me} onDone={() => setComposer(false)} />}
      {acts.length ? (
        <ActivityTimeline items={acts} onPress={mine ? (a) => setEditing(a) : undefined} />
      ) : (
        <Text style={type.small}>Moments you capture will appear here in order.</Text>
      )}
      {editing && mine && <ActivityEditor journeyId={j.id} activity={editing} onClose={() => setEditing(null)} />}

      {mine && <JourneySettings j={j} />}
    </Screen>
  );

}

function ActivityEditor({ journeyId, activity, onClose }: { journeyId: string; activity: Activity; onClose: () => void }) {
  const [title, setTitle] = useState(activity.title);
  const [caption, setCaption] = useState(activity.caption);
  const [vis, setVis] = useState<Visibility>(activity.visibility);
  const [err, setErr] = useState<string | null>(null);
  if (activity.type === 'start' || activity.type === 'end') return null;
  return (
    <Card style={{ marginBottom: 12 }}>
      <Text style={[type.h3, { marginBottom: 10 }]}>Edit activity</Text>
      <Field value={title} onChangeText={setTitle} placeholder="Title" />
      <Field value={caption} onChangeText={setCaption} placeholder="Caption" multiline />
      <Row style={{ flexWrap: 'wrap', marginBottom: 10 }}>
        {(['private', 'followers', 'crew', 'public'] as Visibility[]).map((v) => (
          <Chip key={v} label={v} active={vis === v} onPress={() => setVis(v)} />
        ))}
      </Row>
      <ErrorText text={err} />
      <Row>
        <Button
          small
          variant="danger"
          title="Delete"
          onPress={async () => {
            if (!(await confirmAsync('Delete activity?', 'This cannot be undone.', 'Delete'))) return;
            try {
              await deleteActivity(journeyId, activity);
              onClose();
            } catch (e) {
              setErr(errorMessage(e));
            }
          }}
        />
        <View style={{ flex: 1 }} />
        <Button small variant="ghost" title="Cancel" onPress={onClose} />
        <Button
          small
          title="Save"
          onPress={async () => {
            try {
              await updateActivity(journeyId, activity.id, { title, caption, visibility: vis });
              onClose();
            } catch (e) {
              setErr(errorMessage(e));
            }
          }}
        />
      </Row>
    </Card>
  );
}

function JourneySettings({ j }: { j: Journey }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(j.title);
  const [err, setErr] = useState<string | null>(null);
  return (
    <View style={{ marginTop: 8 }}>
      <Pressable onPress={() => setOpen(!open)}>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 12 }}>
          <Text style={type.h3}>Journey settings & privacy</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </Row>
      </Pressable>
      {open && (
        <Card>
          <Field label="Title" value={title} onChangeText={setTitle} onBlur={() => title.trim() && title !== j.title && updateJourney(j.id, { title: title.trim() }).catch((e) => setErr(errorMessage(e)))} />
          <Text style={[type.small, { marginBottom: 6 }]}>Who can see this journey</Text>
          <Row style={{ flexWrap: 'wrap', marginBottom: 12 }}>
            {(['private', 'followers', ...(j.groupId ? (['crew'] as const) : []), 'public'] as Visibility[]).map((v) => (
              <Chip key={v} label={v} active={j.visibility === v} onPress={() => updateJourney(j.id, { visibility: v }).catch((e) => setErr(errorMessage(e)))} />
            ))}
          </Row>
          <Text style={[type.tiny, { marginBottom: 12 }]}>GPS history is always private to you, whatever the journey visibility.</Text>
          <Button
            small
            variant="secondary"
            icon="trash-outline"
            title="Delete location history"
            onPress={async () => {
              if (!(await confirmAsync('Delete location history?', 'The recorded GPS route for this journey will be permanently deleted. Photos and activities are kept.', 'Delete'))) return;
              await clearLocationHistory(j.id).catch((e) => setErr(errorMessage(e)));
              toast('Location history deleted');
            }}
          />
          <View style={{ height: 10 }} />
          <Button
            small
            variant="danger"
            icon="trash"
            title="Delete journey"
            onPress={async () => {
              if (!(await confirmAsync('Delete journey?', 'The journey, its route and timeline will be permanently deleted.', 'Delete'))) return;
              try {
                if (tracker.snapshot.journeyId === j.id) await tracker.stop();
                await deleteJourney(j.id);
                router.replace('/journeys');
              } catch (e) {
                setErr(errorMessage(e));
              }
            }}
          />
          <ErrorText text={err} />
        </Card>
      )}
    </View>
  );
}

