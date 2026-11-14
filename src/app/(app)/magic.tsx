import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Share, Text, View } from 'react-native';

import { MagicPlayer, TEMPLATES, type MagicData, type Template } from '@/components/MagicPlayer';
import { toast } from '@/components/PostCard';
import { Appear, Confetti, tap } from '@/components/motion';
import { StoryVideoExporter } from '@/components/StoryVideoExporter';
import { Button, Card, Chip, Empty, ErrorText, Header, InfoText, Loading, Row, Screen } from '@/components/ui';
import { CITY_BY_ID } from '@/data/cities';
import { db } from '@/lib/firebase';
import { clearCustomMusic, getCustomMusic, pickCustomMusic, type CustomMusic } from '@/lib/musicPlayer';
import { useMe } from '@/lib/session';
import { activeDurationMs, formatDurationShort, formatKm } from '@/logic/journey';
import { TRACKS, type TrackId } from '@/logic/musicScore';
import { subscribeGroup, subscribeTimeline } from '@/services/crew';
import { subscribeActivities, subscribeJourney } from '@/services/journeys';
import { notifyMany } from '@/services/notifications';
import { createPost } from '@/services/social';
import { errorMessage, tsToMs } from '@/services/util';
import { colors, type } from '@/theme';
import type { Activity, Group, Journey, TimelineItem } from '@/types';


/** ROAM MAGIC – personal (journeyId) or group (groupId) cinematic video. */
export default function Magic() {
  const me = useMe();
  const { journeyId, groupId, fresh } = useLocalSearchParams<{ journeyId?: string; groupId?: string; fresh?: string }>();
  const [journey, setJourney] = useState<Journey | null | undefined>(journeyId ? undefined : null);
  const [acts, setActs] = useState<Activity[]>([]);
  const [group, setGroup] = useState<Group | null | undefined>(groupId ? undefined : null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [template, setTemplate] = useState<Template>('cinematic');
  const [music, setMusic] = useState<TrackId>('wanderlust');
  const [song, setSong] = useState<CustomMusic | null>(() => getCustomMusic());
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => (journeyId ? subscribeJourney(journeyId, setJourney) : undefined), [journeyId]);
  useEffect(() => (journeyId ? subscribeActivities(journeyId, setActs) : undefined), [journeyId]);
  useEffect(() => (groupId ? subscribeGroup(groupId, setGroup) : undefined), [groupId]);
  useEffect(() => (groupId ? subscribeTimeline(groupId, setTimeline) : undefined), [groupId]);

  const data: MagicData | null = useMemo(() => {
    if (journey) {
      const city = journey.anchorCityId ? CITY_BY_ID[journey.anchorCityId] : null;
      const media = acts.filter((a) => a.type === 'photo' || a.type === 'video');
      const places = acts.filter((a) => a.lat != null && a.lng != null && a.type !== 'start' && a.type !== 'end');
      return {
        title: journey.title,
        subtitle: journey.ownerName,
        city,
        country: journey.countries[0] ?? city?.country ?? null,
        route: journey.route ?? [],
        places: places.map((a) => ({ lat: a.lat!, lng: a.lng!, label: a.placeName ?? undefined })),
        memories: media.map((a) => ({ url: a.mediaUrl, isVideo: a.type === 'video', place: a.placeName ?? a.city, time: a.createdAt, caption: a.caption })),
        stats: [
          { label: 'Distance', value: formatKm(journey.distanceKm) },
          { label: 'Places', value: String(journey.placesCount) },
          { label: 'Photos', value: String(journey.photos) },
          { label: 'Videos', value: String(journey.videos) },
          { label: 'Duration', value: formatDurationShort(activeDurationMs(journey)) },
          { label: 'Cities', value: String(journey.cities.length) },
        ],
      };
    }
    if (group) {
      const city = group.destinationCityId ? CITY_BY_ID[group.destinationCityId] : null;
      // Respect member opt-outs (BRD 11.6, BR-013)
      const allowed = timeline.filter((i) => !group.videoExcludedUids?.includes(i.authorId));
      const media = allowed.filter((i) => i.mediaUrl);
      const places = Array.from(new Set(allowed.map((i) => i.placeName).filter(Boolean))) as string[];
      return {
        title: group.name,
        subtitle: `${group.memberIds.length} Friends`,
        city,
        country: city?.country ?? null,
        route: [],
        places: city
          ? places.slice(0, 8).map((label, i) => ({ lat: city.lat + Math.sin(i * 1.7) * 0.05, lng: city.lng + Math.cos(i * 1.3) * 0.06, label }))
          : [],
        memories: media.map((i) => ({ url: i.mediaUrl, isVideo: i.type === 'video', place: i.placeName, time: tsToMs(i.createdAt), author: i.authorName, caption: i.text })),
        stats: [
          { label: 'Friends', value: String(group.memberIds.length) },
          { label: 'Places', value: String(places.length) },
          { label: 'Memories', value: String(media.length) },
          { label: 'Moments', value: String(allowed.filter((i) => i.type !== 'join' && i.type !== 'expense').length) },
        ],
      };
    }
    return null;
  }, [journey, acts, group, timeline]);

  const storyData = useMemo(
    () =>
      data && {
        title: data.title,
        subtitle: data.subtitle,
        cityName: data.city?.name ?? null,
        cityEmoji: data.city?.emoji ?? null,
        colors: (data.city?.colors ?? ['#8B5CF6', '#EC4899']) as [string, string],
        country: data.country,
        route: data.route,
        places: data.places,
        memories: data.memories,
        stats: data.stats,
      },
    [data],
  );

  if (journey === undefined || group === undefined) return <Screen><Loading label="Preparing your story…" /></Screen>;
  if (!data)
    return (
      <Screen>
        <Header title="ROAM Magic" />
        <Empty icon="film-outline" title="Nothing to render" text="Open ROAM Magic from a completed journey or a crew trip." />
      </Screen>
    );

  const isGroup = !!group;
  const canSave = isGroup || journey?.ownerId === me.uid;
  const save = async () => {
    setErr(null);
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, 'travelVideos'), {
        ownerId: me.uid,
        journeyId: journey?.id ?? null,
        ...(group ? { groupId: group.id } : {}),
        title: data.title,
        template,
        music,
        visibility: isGroup ? 'crew' : 'private',
        createdAt: serverTimestamp(),
      });
      setSavedId(ref.id);
      tap('success');
      if (group) await notifyMany(group.memberIds, me, 'video', `${me.displayName} created the “${group.name}” group video 🎬`, `/magic?groupId=${group.id}`);
      toast('Video saved to your journeys');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="✨ ROAM Magic Video" subtitle={isGroup ? 'Group cinematic video' : 'Personal cinematic video'} />
      {fresh === '1' && (
        <Appear>
          <Card style={{ marginBottom: 14, borderColor: colors.violet }} testID="trip-complete-banner">
            <Text style={type.h3}>🎉 Trip complete! Your story is ready</Text>
            <Text style={[type.small, { marginTop: 4 }]}>We combined your photos, videos, route and stats into a cinematic story. Create the video below and share it with friends.</Text>
          </Card>
        </Appear>
      )}
      <MagicPlayer data={data} template={template} music={music} />
      <Confetti fire={savedId ? 1 : 0} />

      <Text style={[type.h3, { marginTop: 20, marginBottom: 10 }]}>Template</Text>
      <Row style={{ flexWrap: 'wrap' }}>
        {TEMPLATES.map((t) => (
          <Chip key={t.id} label={`${t.label} (${t.sub})`} active={template === t.id} onPress={() => setTemplate(t.id)} testID={`template-${t.id}`} />
        ))}
      </Row>
      <Text style={[type.h3, { marginTop: 16, marginBottom: 10 }]}>Music</Text>
      <Row style={{ flexWrap: 'wrap' }}>
        {TRACKS.map((m) => (
          <Chip key={m.id} label={`${m.emoji} ${m.label}`} active={music === m.id} onPress={() => setMusic(m.id)} testID={`music-${m.id}`} />
        ))}
        <Chip
          icon="musical-notes"
          label={song ? `🎧 ${song.name.slice(0, 22)}` : '📁 My music'}
          active={music === 'custom'}
          testID="music-custom"
          onPress={async () => {
            setErr(null);
            if (Platform.OS !== 'web') return toast('Adding your own song is available in the ROAM web app for now');
            if (song && music !== 'custom') return setMusic('custom');
            try {
              const picked = await pickCustomMusic();
              if (picked) {
                setSong(picked);
                setMusic('custom');
                toast(`🎧 “${picked.name}” added as your soundtrack`);
              }
            } catch (e) {
              setErr(errorMessage(e));
            }
          }}
        />
      </Row>
      {song && (
        <Row style={{ marginTop: 4, justifyContent: 'space-between' }}>
          <Text style={[type.tiny, { flex: 1 }]} testID="custom-music-name">
            Your song: {song.name} · {(song.sizeBytes / 1024 / 1024).toFixed(1)} MB. Only use music you have the rights to share.
          </Text>
          <Button
            small
            variant="ghost"
            title="Remove"
            testID="custom-music-remove"
            onPress={() => {
              clearCustomMusic();
              setSong(null);
              if (music === 'custom') setMusic('wanderlust');
            }}
          />
        </Row>
      )}
      {storyData && <StoryVideoExporter data={storyData} track={music} autoFocus={fresh === '1'} onCreated={() => void (!savedId && canSave && save())} />}
      {isGroup && (
        <Card style={{ marginTop: 16 }}>
          <Text style={type.small}>
            Only moments from members who have not opted out are included
            {group!.videoExcludedUids?.length ? ` (${group!.videoExcludedUids.length} opted out)` : ''}. Each member controls this in Trip settings.
          </Text>
          <Button small variant="ghost" title="My contribution settings" style={{ marginTop: 10 }} onPress={() => router.push(`/trip/${group!.id}/settings`)} />
        </Card>
      )}
      <ErrorText text={err} />
      <View style={{ gap: 10, marginTop: 16 }}>
        {canSave && <Button testID="magic-save" title={savedId ? 'Saved ✓' : 'Save video'} icon="download-outline" onPress={save} loading={saving} disabled={!!savedId} />}
        <Button
          variant="secondary"
          title="Share"
          icon="share-social-outline"
          onPress={async () => {
            try {
              await Share.share({ message: `Watch “${data.title}” on ROAM ✨ https://roam.app/video/${savedId ?? journey?.id ?? group?.id}` });
            } catch {}
          }}
        />
        {!isGroup && journey?.ownerId === me.uid && (
          <Button
            variant="ghost"
            title="Post to my feed"
            icon="paper-plane-outline"
            onPress={async () => {
              try {
                await createPost(me, {
                  text: `🎬 ${data.title} — my ROAM Magic video`,
                  visibility: me.defaultPostVisibility === 'private' ? 'followers' : me.defaultPostVisibility,
                  city: data.city?.name ?? null,
                  journeyId: journey.id,
                  mediaUrl: journey.coverUrl,
                  mediaType: journey.coverUrl ? 'image' : null,
                  kind: 'video',
                });
                toast('Posted to your feed');
              } catch (e) {
                setErr(errorMessage(e));
              }
            }}
          />
        )}
      </View>
      <View style={{ marginTop: 14 }}>
        <InfoText icon="shield-checkmark" text="Story videos are created on your device from your trip's photos and videos. Nothing is posted anywhere until you choose to share it." />
      </View>
    </Screen>
  );
}
