import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { confirmAsync, PostCard, toast } from '@/components/PostCard';
import { Avatar, Button, Card, Empty, ErrorText, Header, IconButton, Loading, Row, Screen, SectionTitle, Stat, goBackOr } from '@/components/ui';
import { useMe } from '@/lib/session';
import { loadUserPosts, report } from '@/services/social';
import { blockUser, follow, getProfile, isFollowing, loadPublicJourneys, unfollow } from '@/services/users';
import { errorMessage } from '@/services/util';
import { colors, space, type } from '@/theme';
import type { Post, UserProfile } from '@/types';

export default function TravellerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const [following, setFollowing] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [journeys, setJourneys] = useState<{ id: string; title: string; cities: string[]; countries: string[]; status: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const p = await getProfile(id);
    setProfile(p);
    setFollowing(await isFollowing(me.uid, id).catch(() => false));
    if (p) {
      setPosts(await loadUserPosts(me.uid, id).catch(() => []));
      setJourneys(await loadPublicJourneys(id).catch(() => []));
    }
  }, [id, me.uid]);

  useEffect(() => {
    if (id === me.uid) {
      router.replace('/profile');
      return;
    }
    load();
  }, [id, me.uid, load]);

  const toggle = async () => {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      if (following) await unfollow(me.uid, id);
      else await follow(me, id);
      setFollowing(!following);
      setProfile(await getProfile(id));
      setPosts(await loadUserPosts(me.uid, id).catch(() => []));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const doReport = async () => {
    setMenu(false);
    if (!id) return;
    if (await confirmAsync('Report traveller', 'Report this account to ROAM moderators?', 'Report')) {
      try {
        await report(me.uid, 'user', id, 'Reported account', id);
        toast('Thanks — this account has been reported for review.');
      } catch (e) {
        setError(errorMessage(e));
      }
    }
  };

  const doBlock = async () => {
    setMenu(false);
    if (!id) return;
    if (await confirmAsync('Block traveller', 'They will be removed from your followers and their posts hidden from your feed.', 'Block')) {
      try {
        await blockUser(me.uid, id);
        toast('Traveller blocked.');
        goBackOr('/explore');
      } catch (e) {
        setError(errorMessage(e));
      }
    }
  };

  const right = <IconButton icon="ellipsis-horizontal" accessibilityLabel="More options" onPress={() => setMenu((m) => !m)} />;

  if (profile === undefined) {
    return (
      <Screen>
        <Header title="Traveller" right={right} />
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title={profile ? profile.displayName : 'Traveller'} subtitle={profile ? `@${profile.username}` : undefined} right={right} />
      {menu && (
        <Card style={{ marginBottom: space.md, paddingVertical: space.sm }}>
          <Pressable onPress={doReport} style={{ paddingVertical: 10 }} testID="report-user">
            <Row>
              <Ionicons name="flag-outline" size={18} color={colors.orange} />
              <Text style={type.body}>Report user</Text>
            </Row>
          </Pressable>
          <Pressable onPress={doBlock} style={{ paddingVertical: 10 }} testID="block-user">
            <Row>
              <Ionicons name="ban-outline" size={18} color={colors.red} />
              <Text style={type.body}>Block</Text>
            </Row>
          </Pressable>
        </Card>
      )}
      <ErrorText text={error} />
      {!profile ? (
        <Empty
          icon="lock-closed"
          title="This account is private"
          text="Follow requests aren’t available for private accounts yet. Only approved followers can see their travels."
        />
      ) : (
        <>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Avatar name={profile.displayName} uri={profile.photoURL} size={92} ring />
            <Text style={[type.h1, { marginTop: 8 }]}>{profile.displayName}</Text>
            <Text style={type.small}>
              @{profile.username}
              {profile.homeCity ? ` · ${profile.homeCity}` : ''}
            </Text>
            {!!profile.bio && <Text style={[type.body, { textAlign: 'center', color: colors.textMuted }]}>{profile.bio}</Text>}
          </View>
          <Card style={{ marginTop: space.lg }}>
            <Row>
              <Stat value={profile.followersCount} label="Followers" />
              <Stat value={profile.followingCount} label="Following" />
              <Stat value={journeys.length} label="Public journeys" />
              <Stat value={new Set(journeys.flatMap((j) => j.countries)).size} label="Countries" />
            </Row>
          </Card>
          <Button
            title={following ? 'Following' : 'Follow'}
            icon={following ? 'checkmark' : 'person-add'}
            variant={following ? 'secondary' : 'primary'}
            loading={busy}
            onPress={toggle}
            style={{ marginTop: space.lg }}
            testID="follow-button"
          />

          {journeys.length > 0 && (
            <>
              <SectionTitle title="Journeys" />
              {journeys.map((j) => (
                <Card key={j.id} style={{ marginBottom: space.sm }}>
                  <Row>
                    <Ionicons name="map" size={18} color={colors.cyan} />
                    <View style={{ flex: 1 }}>
                      <Text style={type.h3}>{j.title}</Text>
                      <Text style={type.tiny}>{j.cities.join(' · ') || 'On the road'}</Text>
                    </View>
                  </Row>
                </Card>
              ))}
            </>
          )}

          <SectionTitle title="Travel stories" />
          {posts.length === 0 ? (
            <Empty icon="images-outline" title="No stories to show" text={following ? 'Nothing shared yet.' : 'Follow to see followers-only stories.'} />
          ) : (
            posts.map((p) => <PostCard key={p.id} post={p} me={me} />)
          )}
        </>
      )}
    </Screen>
  );
}
