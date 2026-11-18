
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { confirmAsync, PostCard } from '@/components/PostCard';
import { IconBadge, PressScale, type IconGradient } from '@/components/motion';
import { Avatar, Button, Card, Empty, goBackOr, IconButton, Loading, Row, Screen, Segmented, Stat, type IconName } from '@/components/ui';
import { passportStats } from '@/logic/achievements';
import { signOut, useMe, useSession } from '@/lib/session';
import { subscribeMyJourneys } from '@/services/journeys';
import { subscribeNotifications } from '@/services/notifications';
import { loadSavedPosts, loadUserPosts } from '@/services/social';
import { colors, radius, space, type, shadows } from '@/theme';
import type { AppNotification, Journey, Post } from '@/types';

export default function Profile() {
  const me = useMe();
  const { admin } = useSession();
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [tab, setTab] = useState<'posts' | 'saved'>('posts');
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [saved, setSaved] = useState<Post[] | null>(null);
  const [notes, setNotes] = useState<AppNotification[]>([]);

  useEffect(() => subscribeMyJourneys(me.uid, setJourneys), [me.uid]);
  useEffect(() => subscribeNotifications(me.uid, setNotes), [me.uid]);

  useFocusEffect(
    useCallback(() => {
      loadUserPosts(me.uid, me.uid).then(setPosts).catch(() => setPosts([]));
      loadSavedPosts(me.uid).then(setSaved).catch(() => setSaved([]));
    }, [me.uid]),
  );

  const stats = useMemo(() => passportStats(journeys), [journeys]);
  const places = journeys.reduce((s, j) => s + (j.placesCount ?? 0), 0);
  const unread = notes.filter((n) => !n.read && me.notificationPrefs?.[n.type] !== false).length;
  const list = tab === 'posts' ? posts : saved;

  return (
    <Screen>
      <Row style={{ marginBottom: space.lg }}>
        <IconButton icon="chevron-back" accessibilityLabel="Back"onPress={() => goBackOr('/')} />
        <Text style={[type.h1, { flex: 1, marginLeft: 10 }]}>My Travel Passport</Text>
        <IconButton icon="notifications-outline" badge={unread} accessibilityLabel="Notifications" onPress={() => router.push('/notifications')} />
        <IconButton icon="settings-outline" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
      </Row>

      <Card>
        <Row style={{ gap: space.lg }}>
          <Avatar name={me.displayName} uri={me.photoURL} size={76} ring />
          <View style={{ flex: 1 }}>
            <Text style={type.h2} testID="profile-name">
              {me.displayName}
            </Text>
            <Text style={type.small}>@{me.username}</Text>
            <Text style={[type.small, { color: colors.cyan, marginTop: 2 }]}>
              {stats.countries.length > 1 ? 'Global Traveller' : 'Explorer'}
              {me.homeCity ? ` · ${me.homeCity}` : ''}
            </Text>
          </View>
        </Row>
        {!!me.bio && <Text style={[type.small, { marginTop: space.md }]}>{me.bio}</Text>}
        <Row style={{ marginTop: space.lg }}>
          <Stat value={stats.countries.length} label="Countries" />
          <Stat value={stats.cities.length} label="Cities" />
          <Stat value={places} label="Places" />
          <Stat value={me.followersCount} label="Followers" />
          <Stat value={me.followingCount} label="Following" />
        </Row>
      </Card>

      <Row style={{ marginTop: space.lg, gap: space.sm }}>
        <Tile icon="book" label="Travel Passport" onPress={() => router.push('/passport')} testID="open-passport" />
        <Tile icon="create" label="Edit profile" onPress={() => router.push('/settings')} testID="open-settings" />
        <Tile icon="notifications" label="Notifications" onPress={() => router.push('/notifications')} />
        {admin && <Tile icon="shield" label="Admin" onPress={() => router.push('/admin')} testID="open-admin" />}
      </Row>

      <View style={{ marginTop: space.xl, marginBottom: space.md }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: 'posts', label: 'My posts' },
            { id: 'saved', label: 'Saved' },
          ]}
        />
      </View>
      {list === null ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty
          icon={tab === 'posts' ? 'images-outline' : 'bookmark-outline'}
          title={tab === 'posts' ? 'No posts yet' : 'Nothing saved yet'}
          text={tab === 'posts' ? 'Capture a moment with the + button to share it.' : 'Tap the bookmark on a post to save it here.'}
        />
      ) : (
        list.map((p) => <PostCard key={p.id} post={p} me={me} />)
      )}

      <Button
        title="Sign out"
        icon="log-out-outline"
        variant="ghost"
        style={{ marginTop: space.xl }}
        testID="sign-out"
        onPress={async () => {
          if (await confirmAsync('Sign out', 'Sign out of ROAM on this device?', 'Sign out')) await signOut();
        }}
      />
    </Screen>
  );
}

function Tile({ icon, label, onPress, testID }: { icon: IconName; label: string; onPress: () => void; testID?: string }) {
  return (
    <PressScale onPress={onPress} style={styles.tile} accessibilityRole="button" accessibilityLabel={label} testID={testID} scaleTo={0.92}>
      <IconBadge icon={icon} gradient={TILE_GRADIENT[icon as string] ?? 'violet'} size={38} />
      <Text style={{ color: colors.text, fontSize: 11, fontWeight: '800', textAlign: 'center' }}>{label}</Text>
    </PressScale>
  );
}

const TILE_GRADIENT: Record<string, IconGradient> = {'business': 'ocean', 'people': 'sunset', 'map': 'mint', 'images': 'candy', 'book': 'violet', 'create': 'sky', 'notifications': 'gold', 'shield': 'fire'};

const styles = StyleSheet.create({
  tile: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, ...shadows.soft },
});
