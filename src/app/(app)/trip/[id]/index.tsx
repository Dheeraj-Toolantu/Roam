import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { VideoPlayer } from '@/components/VideoPlayer';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CrewLiveMap } from '@/components/CrewLiveMap';
import { confirmAsync, toast } from '@/components/PostCard';
import { Appear, IconBadge, type IconGradient } from '@/components/motion';
import { Avatar, AvatarStack, Button, Card, Chip, Empty, ErrorText, Field, IconButton, Loading, Pill, ProgressBar, Row, Screen, Segmented, type IconName, goBackOr } from '@/components/ui';
import { CITY_BY_ID } from '@/data/cities';
import { memberName, tripDates, useTripMoney } from '@/hooks/useTrip';
import { useMe } from '@/lib/session';
import { formatMoney } from '@/logic/split';
import {
  addTimelineComment,
  addTimelineItem,
  deleteTimelineItem,
  subscribeGroupJourneys,
  subscribeTimeline,
  subscribeTimelineComments,
} from '@/services/crew';
import { pickMedia, uploadMoment, type PickedMedia } from '@/services/media';
import { report } from '@/services/social';
import { clockTime, errorMessage, timeAgo, tsToMs } from '@/services/util';
import { colors, radius, space, type } from '@/theme';
import type { Comment, Journey, TimelineItem } from '@/types';

type Tab = 'timeline' | 'moments' | 'map' | 'members';

export default function TripDashboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const { group, summary } = useTripMoney(id, me.uid);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [tab, setTab] = useState<Tab>('timeline');
  const [person, setPerson] = useState<string | null>(null);
  const [composer, setComposer] = useState(false);

  useEffect(() => subscribeTimeline(id, setItems), [id]);
  useEffect(() => subscribeGroupJourneys(id, setJourneys), [id]);

  const filtered = useMemo(() => items.filter((i) => !person || i.authorId === person), [items, person]);

  if (group === undefined) return <Screen><Loading /></Screen>;
  if (group === null || !group.memberIds.includes(me.uid))
    return (
      <Screen>
        <Row><IconButton icon="chevron-back" onPress={() => goBackOr('/crew')} /></Row>
        <Empty icon="lock-closed-outline" title="Trip not available" text="This trip doesn't exist or you are not a member." />
      </Screen>
    );

  const city = group.destinationCityId ? CITY_BY_ID[group.destinationCityId] : null;
  const media = items.filter((i) => i.mediaUrl);
  const isAdmin = group.adminIds.includes(me.uid);

  const tiles: { icon: IconName; label: string; onPress: () => void; testID: string; gradient: IconGradient }[] = [
    { icon: 'time', label: 'Trip Timeline', onPress: () => setTab('timeline'), testID: 'tile-timeline', gradient: 'ocean' },
    { icon: 'images', label: 'Group Album', onPress: () => setTab('moments'), testID: 'tile-album', gradient: 'candy' },
    { icon: 'wallet', label: 'ROAM Split', onPress: () => router.push(`/trip/${id}/split`), testID: 'tile-split', gradient: 'gold' },
    { icon: 'people', label: 'Members', onPress: () => setTab('members'), testID: 'tile-members', gradient: 'sunset' },
    { icon: 'film', label: 'Group Video', onPress: () => router.push(`/magic?groupId=${id}`), testID: 'tile-video', gradient: 'violet' },
    { icon: 'person-add', label: 'Invite', onPress: () => router.push(`/trip/${id}/invite`), testID: 'tile-invite', gradient: 'mint' },
  ];

  return (
    <Screen edges={['top', 'bottom']}>
      <Row style={{ marginBottom: 12 }}>
        <IconButton icon="chevron-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/crew'))} accessibilityLabel="Back" />
        <View style={{ flex: 1 }} />
        <IconButton icon="settings-outline" onPress={() => router.push(`/trip/${id}/settings`)} accessibilityLabel="Trip settings" />
      </Row>

      <LinearGradient colors={[group.colors?.[0] ?? colors.orange, group.colors?.[1] ?? colors.pink, '#1B1838']} start={{ x: 0, y: 0 }} end={{ x: 0.5, y: 1.4 }} style={{ borderRadius: radius.lg, padding: 18 }}>
        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900' }} testID="trip-title">
          {group.name} {city?.emoji ?? ''}
        </Text>
        <Text style={{ color: '#ffffffd0', marginTop: 2 }}>
          {group.destination || 'Destination TBD'} · {tripDates(group)} · {group.memberIds.length} members
        </Text>
        {!!group.description && <Text style={{ color: '#ffffffb0', marginTop: 8 }}>{group.description}</Text>}
        <Row style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <AvatarStack names={group.memberIds.map((u) => memberName(group, u))} size={32} />
          <Button small variant="light" title="Start group journey" icon="navigate" onPress={() => router.push(`/journey/start?groupId=${id}`)} />
        </Row>
      </LinearGradient>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
        {tiles.map((t) => (
          <Pressable key={t.label} onPress={t.onPress} style={{ width: '31.5%' }} testID={t.testID} accessibilityRole="button" accessibilityLabel={t.label}>
            <Card style={{ alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4, gap: 6 }}>
              <IconBadge icon={t.icon} gradient={t.gradient} size={40} />
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>{t.label}</Text>
            </Card>
          </Pressable>
        ))}
      </View>

      {!!group.endDate && group.endDate < new Date().toISOString().slice(0, 10) && (
        <Appear>
          <Card style={{ marginTop: 14, borderColor: colors.pink }} onPress={() => router.push(`/magic?groupId=${id}&fresh=1`)} testID="group-story-banner">
            <Row gap={12}>
              <IconBadge icon="film" gradient="candy" size={46} float />
              <View style={{ flex: 1 }}>
                <Text style={type.h3}>Trip&apos;s over! Make your group story 🎬</Text>
                <Text style={type.small}>Everyone&apos;s photos & videos in one cinematic video with music — share it on WhatsApp or Facebook.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Row>
          </Card>
        </Appear>
      )}

      {summary && (
        <Card style={{ marginTop: 14 }} onPress={() => router.push(`/trip/${id}/split`)} testID="split-summary">
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={type.h3}>ROAM Split</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Row>
          <Row style={{ marginTop: 10, justifyContent: 'space-between' }}>
            <View>
              <Text style={type.tiny}>Total spent</Text>
              <Text style={type.h2}>{formatMoney(summary.total)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={type.tiny}>{summary.yourBalance >= 0 ? 'You will receive' : 'You owe'}</Text>
              <Text style={[type.h2, { color: summary.yourBalance > 0 ? colors.green : summary.yourBalance < 0 ? colors.red : colors.text }]}>
                {formatMoney(Math.abs(summary.yourBalance))}
              </Text>
            </View>
          </Row>
          {summary.budget.level !== 'none' && (
            <View style={{ marginTop: 10, gap: 4 }}>
              <ProgressBar pct={summary.budget.pct} color={summary.budget.level === 'over' ? colors.red : summary.budget.level === 'warning' ? colors.yellow : colors.cyan} />
              <Text style={type.tiny}>
                {Math.round(summary.budget.pct)}% of {formatMoney(summary.budget.budget)} budget used
              </Text>
            </View>
          )}
        </Card>
      )}

      <View style={{ height: 16 }} />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: 'timeline', label: 'Timeline' },
          { id: 'moments', label: 'Moments' },
          { id: 'map', label: 'Map' },
          { id: 'members', label: 'Members' },
        ]}
      />
      <View style={{ height: 14 }} />

      {tab === 'timeline' && (
        <>
          <Row style={{ flexWrap: 'wrap', marginBottom: 10 }}>
            <Chip label="Everyone" active={!person} onPress={() => setPerson(null)} />
            {group.memberIds.map((u) => (
              <Chip key={u} label={memberName(group, u, me.uid)} active={person === u} onPress={() => setPerson(u)} />
            ))}
          </Row>
          {composer ? (
            <MomentComposer groupId={id} memberIds={group.memberIds} groupName={group.name} onDone={() => setComposer(false)} />
          ) : (
            <Button testID="add-moment" title="Add Moment" icon="add-circle-outline" variant="secondary" onPress={() => setComposer(true)} style={{ marginBottom: 14 }} />
          )}
          {filtered.length === 0 ? (
            <Empty icon="time-outline" title="No shared moments yet" text="Moments members share with the crew appear here in order." />
          ) : (
            filtered.map((i, k) => (
              <TimelineRow key={i.id} item={i} last={k === filtered.length - 1} groupId={id} canDelete={i.authorId === me.uid || isAdmin} />
            ))
          )}
        </>
      )}

      {tab === 'moments' &&
        (media.length === 0 ? (
          <Empty icon="images-outline" title="No photos or videos yet" text="Share a moment with a photo to start the group album." />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {media.map((m) => (
              <View key={m.id} style={{ width: '32%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.card }}>
                {m.type === 'video' ? (
                  <VideoPlayer uri={m.mediaUrl!} poster={m.thumbUrl} compact style={{ flex: 1 }} testID={`moment-video-${m.id}`} />
                ) : (
                  <Image source={{ uri: m.mediaUrl! }} style={{ flex: 1 }} contentFit="cover" />
                )}
              </View>
            ))}
          </View>
        ))}

      {tab === 'map' && <CrewLiveMap group={group} me={me} journeys={journeys} />}

      {tab === 'members' && (
        <>
          {group.memberIds.map((u) => (
            <Card key={u} style={{ marginBottom: 10 }} onPress={() => u !== me.uid && router.push(`/user/${u}`)}>
              <Row>
                <Avatar name={memberName(group, u)} size={40} />
                <Text style={[type.h3, { flex: 1 }]}>{memberName(group, u, me.uid)}</Text>
                {u === group.ownerId ? <Pill text="Owner" color={colors.yellow} /> : group.adminIds.includes(u) ? <Pill text="Admin" color={colors.cyan} /> : null}
              </Row>
            </Card>
          ))}
          <Button title="Invite friends" icon="person-add" onPress={() => router.push(`/trip/${id}/invite`)} style={{ marginTop: 6 }} />
        </>
      )}
    </Screen>
  );
}

function MomentComposer({ groupId, memberIds, groupName, onDone }: { groupId: string; memberIds: string[]; groupName: string; onDone: () => void }) {
  const me = useMe();
  const [text, setText] = useState('');
  const [place, setPlace] = useState('');
  const [media, setMedia] = useState<PickedMedia | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setErr(null);
    if (!text.trim() && !media) return setErr('Write something or add a photo');
    setBusy(true);
    try {
      const up = media ? await uploadMoment(me.uid, media) : null;
      const url = up?.url ?? null;
      await addTimelineItem(
        groupId,
        me,
        { type: media ? (media.type === 'video' ? 'video' : 'photo') : place.trim() ? 'place' : 'note', text: text.trim() || `At ${place.trim()}`, mediaUrl: url, thumbUrl: up?.thumbUrl ?? null, placeName: place.trim() || null },
        { memberIds, groupName },
      );
      onDone();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginBottom: 14 }}>
      <Field testID="moment-text" placeholder="Share a moment with the crew…" value={text} onChangeText={setText} multiline />
      <Field icon="location-outline" placeholder="Place (optional)" value={place} onChangeText={setPlace} />
      {media && (
        <Row style={{ marginBottom: 10 }}>
          <Ionicons name={media.type === 'video' ? 'videocam' : 'image'} size={18} color={colors.cyan} />
          <Text style={[type.small, { flex: 1 }]}>{media.type === 'video' ? 'Video' : 'Photo'} attached</Text>
          <IconButton icon="close" onPress={() => setMedia(null)} accessibilityLabel="Remove attachment" />
        </Row>
      )}
      <ErrorText text={err} />
      <Row>
        <IconButton icon="images-outline" onPress={() => pickMedia('library').then((m) => m && setMedia(m), (e) => toast(errorMessage(e)))} accessibilityLabel="Attach photo or video" />
        <IconButton icon="camera-outline" onPress={() => pickMedia('camera').then((m) => m && setMedia(m), (e) => toast(errorMessage(e)))} accessibilityLabel="Take photo" />
        <View style={{ flex: 1 }} />
        <Button small variant="ghost" title="Cancel" onPress={onDone} />
        <Button small testID="moment-share" title="Share" onPress={save} loading={busy} />
      </Row>
    </Card>
  );
}

function TimelineRow({ item, last, groupId, canDelete }: { item: TimelineItem; last: boolean; groupId: string; canDelete: boolean }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  useEffect(() => (open ? subscribeTimelineComments(groupId, item.id, setComments) : undefined), [open, groupId, item.id]);
  const icon: IconName =
    item.type === 'photo' ? 'camera' : item.type === 'video' ? 'videocam' : item.type === 'expense' ? 'wallet' : item.type === 'join' ? 'person-add' : item.type === 'place' ? 'location' : 'chatbubble-ellipses';

  return (
    <Row gap={12} style={{ alignItems: 'flex-start' }}>
      <View style={{ alignItems: 'center', width: 28 }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.cyan + '30', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={14} color={colors.cyan} />
        </View>
        {!last && <View style={{ width: 2, flex: 1, minHeight: 40, backgroundColor: colors.cardBorder }} />}
      </View>
      <View style={{ flex: 1, paddingBottom: space.lg }}>
        <Text style={type.tiny}>
          {clockTime(item.createdAt)} · {new Date(tsToMs(item.createdAt)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </Text>
        <Text style={type.h3}>{item.placeName ?? item.text}</Text>
        {!!item.placeName && item.text !== `At ${item.placeName}` && <Text style={[type.small, { color: colors.text }]}>{item.text}</Text>}
        <Text style={type.tiny}>Shared by {item.authorId === me.uid ? 'you' : item.authorName}</Text>
        {!!item.mediaUrl && item.type === 'video' && (
          <VideoPlayer uri={item.mediaUrl} poster={item.thumbUrl} style={{ width: '100%', height: 200, borderRadius: radius.md, marginTop: 8 }} testID={`timeline-video-${item.id}`} />
        )}
        {!!item.mediaUrl && item.type !== 'video' && (
          <Image source={{ uri: item.mediaUrl }} style={{ width: '100%', height: 170, borderRadius: radius.md, marginTop: 8 }} contentFit="cover" />
        )}
        {item.type !== 'join' && item.type !== 'expense' && (
          <Row gap={16} style={{ marginTop: 8 }}>
            <Pressable onPress={() => setOpen(!open)}>
              <Row gap={4}>
                <Ionicons name="chatbubble-outline" size={15} color={colors.textMuted} />
                <Text style={type.tiny}>{item.commentsCount} comments</Text>
              </Row>
            </Pressable>
            {canDelete ? (
              <Pressable
                onPress={async () => {
                  if (await confirmAsync('Remove moment?', 'It will be removed from the crew timeline.', 'Remove')) await deleteTimelineItem(groupId, item.id).catch(() => {});
                }}>
                <Text style={type.tiny}>Remove</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={async () => {
                  if (await confirmAsync('Report moment?', 'Report this shared moment to ROAM moderators?', 'Report'))
                    await report(me.uid, 'groupActivity', `${groupId}/${item.id}`, 'Inappropriate group content', item.authorId).catch(() => {});
                }}>
                <Text style={type.tiny}>Report</Text>
              </Pressable>
            )}
          </Row>
        )}
        {open && (
          <View style={{ marginTop: 8, gap: 6 }}>
            {comments.map((c) => (
              <Text key={c.id} style={type.small}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{c.authorName} </Text>
                {c.text} <Text style={type.tiny}>· {timeAgo(c.createdAt)}</Text>
              </Text>
            ))}
            <Row>
              <Field style={{ flex: 1, marginBottom: 0 }} placeholder="Add a comment" value={text} onChangeText={setText} />
              <IconButton
                icon="send"
                color={colors.cyan}
                accessibilityLabel="Send comment"
                onPress={async () => {
                  if (!text.trim()) return;
                  const t = text;
                  setText('');
                  await addTimelineComment(groupId, item.id, me, t).catch(() => setText(t));
                }}
              />
            </Row>
          </View>
        )}
      </View>
    </Row>
  );
}
