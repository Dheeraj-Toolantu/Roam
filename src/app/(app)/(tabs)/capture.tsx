import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { IconBadge, PressScale } from '@/components/motion';
import { Button, Card, Chip, ErrorText, Field, InfoText, ProgressBar, Row, Screen } from '@/components/ui';
import { toast } from '@/components/PostCard';
import { useMe } from '@/lib/session';
import { nearestCity } from '@/logic/journey';
import { addTimelineItem, subscribeMyGroups } from '@/services/crew';
import { addActivity, getActiveJourney } from '@/services/journeys';
import { pickMedia, uploadMedia, type PickedMedia } from '@/services/media';
import { createPost } from '@/services/social';
import { useLiveLocation } from '@/services/location';
import { tracker } from '@/services/tracker';
import { errorMessage } from '@/services/util';
import { colors, gradients, radius, type } from '@/theme';
import type { Group, Journey, Visibility } from '@/types';

/**
 * ROAM camera / upload (BRD §7). A moment is attached to the active journey
 * with its timestamp and (if permitted) location, and can optionally be
 * shared to the feed and/or a crew timeline — each with its own visibility.
 */
export default function Capture() {
  const me = useMe();
  const params = useLocalSearchParams<{ journeyId?: string; groupId?: string }>();
  const [journey, setJourney] = useState<Journey | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [place, setPlace] = useState('');
  const [visibility, setVisibility] = useState<Visibility>(me.defaultPostVisibility ?? 'followers');
  const [crewId, setCrewId] = useState<string | null>(params.groupId ?? null);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const here = useLiveLocation({ detect: true });

  useEffect(() => {
    getActiveJourney(me.uid).then(setJourney).catch(() => setJourney(null));
  }, [me.uid, params.journeyId]);
  useEffect(() => subscribeMyGroups(me.uid, setGroups), [me.uid]);
  useEffect(() => {
    if (journey?.groupId && !crewId) setCrewId(journey.groupId);
  }, [journey, crewId]);

  const pick = async (src: 'camera' | 'library') => {
    setErr(null);
    try {
      const m = await pickMedia(src);
      if (m) setMedia(m);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  const reset = () => {
    setMedia(null);
    setCaption('');
    setPlace('');
    setProgress(null);
  };

  const save = async () => {
    setErr(null);
    if (!media && !caption.trim()) return setErr('Add a photo, video or a few words');
    setProgress(0);
    try {
      const url = media ? await uploadMedia(me.uid, media, 'media', setProgress) : null;
      const fix = await tracker.getCurrentPosition();
      const city = fix ? nearestCity(fix) : null;
      const cityName = city?.name ?? here.place?.city ?? journey?.cities[journey.cities.length - 1] ?? null;
      const type = media?.type === 'video' ? 'video' : media ? 'photo' : 'note';
      if (journey) {
        await addActivity(journey.id, {
          type,
          title: place.trim() || (type === 'photo' ? 'Photo captured' : type === 'video' ? 'Video captured' : caption.trim().slice(0, 60)),
          caption: caption.trim(),
          mediaUrl: url,
          placeName: place.trim() || null,
          city: cityName,
          lat: fix?.lat ?? null,
          lng: fix?.lng ?? null,
          visibility,
        });
      }
      if (visibility !== 'private' && visibility !== 'crew') {
        await createPost(me, {
          text: caption.trim(),
          visibility,
          mediaUrl: url,
          mediaType: media ? media.type : null,
          placeName: place.trim() || null,
          city: cityName,
          journeyId: journey?.id ?? null,
        });
      }
      if (crewId) {
        const g = groups.find((x) => x.id === crewId);
        await addTimelineItem(
          crewId,
          me,
          { type: type === 'note' ? 'note' : type, text: caption.trim() || (place.trim() ? `At ${place.trim()}` : 'New moment'), mediaUrl: url, placeName: place.trim() || null },
          g ? { memberIds: g.memberIds, groupName: g.name } : undefined,
        );
      }
      reset();
      toast(journey ? 'Moment added to your journey' : 'Moment shared');
      // Return to the journey the user captured from (Capture is a tab, so 'back' would follow tab history).
      if (params.journeyId) router.dismissTo(`/journey/${params.journeyId}`);
    } catch (e) {
      setErr(errorMessage(e));
      setProgress(null);
    }
  };

  return (
    <Screen>
      <Text style={[type.h1, { marginBottom: 4 }]}>Capture</Text>
      <Text style={[type.small, { marginBottom: 16 }]}>
        {journey ? `Adding to “${journey.title}”` : 'No active journey — this will be shared as a standalone moment.'}
      </Text>

      {media ? (
        <View style={{ marginBottom: 14 }}>
          {media.type === 'image' ? (
            <Image source={{ uri: media.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg }} contentFit="cover" />
          ) : (
            <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="videocam" size={48} color={colors.pink} />
              <Text style={type.small}>Video ready{media.durationMs ? ` · ${Math.round(media.durationMs / 1000)}s` : ''}</Text>
            </View>
          )}
          <Pressable onPress={() => setMedia(null)} style={{ position: 'absolute', top: 10, right: 10, backgroundColor: colors.overlay, borderRadius: 16, padding: 6 }} accessibilityLabel="Remove media">
            <Ionicons name="close" size={18} color="#fff" />
          </Pressable>
        </View>
      ) : (
        <Row gap={12} style={{ marginBottom: 14 }}>
          <CaptureTile icon="camera" label="Camera" onPress={() => pick('camera')} colors={gradients.sunset} />
          <CaptureTile icon="images" label="Upload" onPress={() => pick('library')} colors={gradients.brand} testID="capture-upload" />
        </Row>
      )}

      <Field testID="capture-caption" placeholder="Say something about this moment…" value={caption} onChangeText={setCaption} multiline />
      <Field testID="capture-place" icon="location-outline" placeholder="Place (e.g. Baga Beach)" value={place} onChangeText={setPlace} />
      {!!here.place && !place && (
        <Row style={{ marginTop: -6, marginBottom: 12 }}>
          <Chip testID="use-current-place" icon="navigate" label={`Use current location: ${here.place.label}`} onPress={() => setPlace(here.place!.label)} />
        </Row>
      )}

      <Text style={[type.small, { fontWeight: '600', marginBottom: 8 }]}>Share with</Text>
      <Row style={{ flexWrap: 'wrap', marginBottom: 6 }}>
        <Chip label="Only me" icon="lock-closed" active={visibility === 'private'} onPress={() => setVisibility('private')} />
        <Chip label="Followers" icon="people" active={visibility === 'followers'} onPress={() => setVisibility('followers')} />
        <Chip label="Public" icon="earth" active={visibility === 'public'} onPress={() => setVisibility('public')} testID="vis-public" />
      </Row>
      {groups.length > 0 && (
        <Card style={{ marginTop: 10 }}>
          <Text style={[type.small, { marginBottom: 8 }]}>Also share to a crew timeline</Text>
          <Row style={{ flexWrap: 'wrap' }}>
            <Chip label="None" active={!crewId} onPress={() => setCrewId(null)} />
            {groups.map((g) => (
              <Chip key={g.id} label={g.name} active={crewId === g.id} onPress={() => setCrewId(g.id)} />
            ))}
          </Row>
          <Text style={[type.tiny, { marginTop: 8 }]}>Sharing with a crew never changes who can see your other posts.</Text>
        </Card>
      )}
      {!journey && (
        <View style={{ marginTop: 10 }}>
          <InfoText text="Start a journey to automatically attach moments to your route and timeline." icon="navigate" />
        </View>
      )}
      <ErrorText text={err} />
      {progress != null && progress < 100 && media && (
        <View style={{ marginTop: 10, gap: 6 }}>
          <Text style={type.tiny}>Uploading… {Math.round(progress)}%</Text>
          <ProgressBar pct={progress} />
        </View>
      )}
      <Button testID="capture-save" title="Save Moment" icon="sparkles" onPress={save} loading={progress != null} style={{ marginTop: 16 }} />
    </Screen>
  );
}

function CaptureTile({ icon, label, onPress, colors: c, testID }: { icon: 'camera' | 'images'; label: string; onPress: () => void; colors: readonly [string, string, ...string[]]; testID?: string }) {
  return (
    <PressScale onPress={onPress} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={label} testID={testID} scaleTo={0.94}>
      <LinearGradient colors={c} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 130, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <IconBadge icon={icon} gradient="violet" size={54} rounded="circle" float />
        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>{label}</Text>
      </LinearGradient>
    </PressScale>
  );
}
