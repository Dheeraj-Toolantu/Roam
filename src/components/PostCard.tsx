import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { hasLiked, isSaved, report, toggleLike, toggleSave } from '../services/social';
import { timeAgo } from '../services/util';
import { colors, radius, space, type } from '../theme';
import type { Post, UserProfile } from '../types';
import { Avatar, Pill, Row } from './ui';

const VIS_ICON = { public: 'earth', followers: 'people', crew: 'people-circle', private: 'lock-closed' } as const;

export function confirmAsync(title: string, message: string, okText = 'OK'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : true);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: okText, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export function toast(message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(message);
  } else Alert.alert('ROAM', message);
}

export function PostCard({ post, me, onChanged }: { post: Post; me: UserProfile; onChanged?: () => void }) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likes, setLikes] = useState(post.likesCount);

  useEffect(() => {
    setLikes(post.likesCount);
    hasLiked(post.id, me.uid).then(setLiked).catch(() => {});
    isSaved(me.uid, post.id).then(setSaved).catch(() => {});
  }, [post.id, post.likesCount, me.uid]);

  const like = async () => {
    const was = liked;
    setLiked(!was);
    setLikes((n) => n + (was ? -1 : 1));
    try {
      await toggleLike(post, me);
    } catch {
      setLiked(was);
      setLikes((n) => n + (was ? 1 : -1));
    }
  };

  const more = async () => {
    if (post.authorId === me.uid) {
      router.push(`/post/${post.id}`);
      return;
    }
    if (await confirmAsync('Report post', 'Report this post as inappropriate? Our moderators will review it.', 'Report')) {
      await report(me.uid, 'post', post.id, 'Inappropriate content', post.authorId);
      toast('Thanks — the post has been reported for review.');
    }
  };

  return (
    <View style={styles.card} testID={`post-${post.id}`}>
      <Row style={{ marginBottom: space.md }}>
        <Pressable onPress={() => router.push(`/user/${post.authorId}`)}>
          <Avatar name={post.authorName} uri={post.authorPhoto} size={38} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={type.h3} onPress={() => router.push(`/user/${post.authorId}`)}>
            {post.authorName}
          </Text>
          <Row gap={6}>
            {!!(post.placeName || post.city) && (
              <>
                <Ionicons name="location" size={12} color={colors.pink} />
                <Text style={type.tiny} numberOfLines={1}>
                  {[post.placeName, post.city].filter(Boolean).join(', ')}
                </Text>
                <Text style={type.tiny}>·</Text>
              </>
            )}
            <Text style={type.tiny}>{timeAgo(post.createdAt)}</Text>
            <Ionicons name={VIS_ICON[post.visibility]} size={11} color={colors.textDim} />
          </Row>
        </View>
        <Pressable onPress={more} hitSlop={10} accessibilityLabel="More options">
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
        </Pressable>
      </Row>
      {post.kind !== 'moment' && (
        <Pill
          text={post.kind === 'achievement' ? 'Achievement unlocked' : post.kind === 'video' ? 'ROAM Magic video' : post.kind === 'review' ? 'Review' : 'Travel story'}
          icon={post.kind === 'achievement' ? 'trophy' : post.kind === 'video' ? 'film' : post.kind === 'review' ? 'star' : 'book'}
          color={post.kind === 'achievement' ? colors.yellow : colors.violet}
          style={{ marginBottom: 8 }}
        />
      )}
      {post.rating != null && (
        <Row gap={2} style={{ marginBottom: 6 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Ionicons key={i} name={i <= (post.rating ?? 0) ? 'star' : 'star-outline'} size={14} color={colors.yellow} />
          ))}
        </Row>
      )}
      {!!post.text && (
        <Text style={[type.body, { marginBottom: post.mediaUrl ? space.md : 0, lineHeight: 21 }]} onPress={() => router.push(`/post/${post.id}`)}>
          {post.text}
        </Text>
      )}
      {!!post.mediaUrl && post.mediaType === 'image' && (
        <Pressable onPress={() => router.push(`/post/${post.id}`)}>
          <Image source={{ uri: post.mediaUrl }} style={styles.media} contentFit="cover" />
        </Pressable>
      )}
      {!!post.mediaUrl && post.mediaType === 'video' && (
        <Pressable onPress={() => router.push(`/post/${post.id}`)} style={[styles.media, styles.video]}>
          <Ionicons name="play-circle" size={54} color="#fff" />
          <Text style={type.small}>Video</Text>
        </Pressable>
      )}
      <Row style={{ marginTop: space.md, justifyContent: 'space-between' }}>
        <Row gap={18}>
          <Pressable onPress={like} accessibilityLabel={liked ? 'Unlike' : 'Like'} testID={`like-${post.id}`}>
            <Row gap={6}>
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? colors.pink : colors.textMuted} />
              <Text style={type.small}>{likes}</Text>
            </Row>
          </Pressable>
          <Pressable onPress={() => router.push(`/post/${post.id}`)} accessibilityLabel="Comments">
            <Row gap={6}>
              <Ionicons name="chatbubble-outline" size={20} color={colors.textMuted} />
              <Text style={type.small}>{post.commentsCount}</Text>
            </Row>
          </Pressable>
          <Pressable
            accessibilityLabel="Share"
            onPress={() => Share.share({ message: `${post.authorName} on ROAM: ${post.text}\nhttps://roam.app/post/${post.id}` }).catch(() => {})}>
            <Ionicons name="paper-plane-outline" size={20} color={colors.textMuted} />
          </Pressable>
        </Row>
        <Pressable
          accessibilityLabel={saved ? 'Unsave' : 'Save'}
          onPress={async () => {
            setSaved(!saved);
            setSaved(await toggleSave(me.uid, post.id).catch(() => saved));
            onChanged?.();
          }}>
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? colors.cyan : colors.textMuted} />
        </Pressable>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.cardBorder, marginBottom: space.md },
  media: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  video: { alignItems: 'center', justifyContent: 'center' },
});
