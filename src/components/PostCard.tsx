import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import Animated from 'react-native-reanimated';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { hasLiked, isSaved, report, toggleLike, toggleSave } from '../services/social';
import { timeAgo } from '../services/util';
import { colors, gradients, radius, shadows, space, type } from '../theme';
import type { Post, UserProfile } from '../types';
import { confirmAsync, toast } from './Dialogs';
import { HeartPop, tap, useBump } from './motion';
import { Avatar, Pill, Row } from './ui';
import { LikersSheet } from './LikersSheet';
import { VideoPlayer } from './VideoPlayer';

const VIS_ICON = { public: 'earth', followers: 'people', crew: 'people-circle', private: 'lock-closed' } as const;

export function PostCard({ post, me, onChanged }: { post: Post; me: UserProfile; onChanged?: () => void }) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likes, setLikes] = useState(post.likesCount);
  const [showLikers, setShowLikers] = useState(false);

  useEffect(() => {
    setLikes(post.likesCount);
    hasLiked(post.id, me.uid).then(setLiked).catch(() => {});
    isSaved(me.uid, post.id).then(setSaved).catch(() => {});
  }, [post.id, post.likesCount, me.uid]);

  const [pop, setPop] = useState(0);
  /** A finished journey shared to the feed: opens the whole trip in sequence. */
  // Older ROAM Magic posts carried only the trip cover (no video file): open the trip instead.
  const legacyMagic = post.kind === 'video' && post.mediaType !== 'video';
  const journeyStory = (post.kind === 'story' || legacyMagic) && !!post.journeyId;
  const openJourney = () => router.push(`/travel/${post.journeyId}`);
  const lastTap = useRef(0);
  const bump = useBump(liked);

  /** Double-tap the photo to like (single tap opens the post). */
  const onMediaPress = () => {
    // eslint-disable-next-line react-hooks/purity -- runs in a tap handler, not during render
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      setPop(now);
      tap('medium');
      if (!liked) void like();
      return;
    }
    lastTap.current = now;
    setTimeout(() => {
      if (lastTap.current !== now) return;
      if (journeyStory) openJourney();
      else router.push(`/post/${post.id}`);
    }, 300);
  };

  const like = async () => {
    const was = liked;
    tap();
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
                <Ionicons name="location" size={12} color={colors.brand} />
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
      {post.kind !== 'moment' && !journeyStory && (
        <Pill
          text={post.kind === 'achievement' ? 'Achievement unlocked' : post.kind === 'video' ? 'ROAM Magic video' : post.kind === 'review' ? 'Review' : 'Travel story'}
          icon={post.kind === 'achievement' ? 'trophy' : post.kind === 'video' ? 'film' : post.kind === 'review' ? 'star' : 'book'}
          color={post.kind === 'achievement' ? colors.yellow : colors.brand}
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
      {!!post.text && !journeyStory && (
        <Text style={[type.body, { marginBottom: post.mediaUrl ? space.md : 0, lineHeight: 21 }]} onPress={() => router.push(`/post/${post.id}`)}>
          {post.text}
        </Text>
      )}
      {journeyStory && (
        <Pressable onPress={onMediaPress} accessibilityRole="button" accessibilityLabel="View the full journey" testID={`journey-story-${post.id}`}>
          <View style={styles.story}>
            {post.mediaUrl && post.mediaType === 'image' ? (
              <Image source={{ uri: post.mediaUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
            ) : (
              <LinearGradient colors={gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            )}
            <LinearGradient colors={['transparent', '#110F26E6']} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />
            <View style={styles.storyTag}>
              <Ionicons name="trail-sign" size={11} color="#fff" />
              <Text style={styles.storyTagText}>{legacyMagic ? 'ROAM MAGIC' : 'JOURNEY COMPLETED'}</Text>
            </View>
            <View style={{ padding: space.md }}>
              <Text style={styles.storyTitle} numberOfLines={2}>
                {post.text.split(':')[0]}
              </Text>
              <Text style={styles.storySub} numberOfLines={2}>
                {post.text.includes(':') ? post.text.slice(post.text.indexOf(':') + 1).trim() : ''}
              </Text>
            </View>
            <HeartPop show={pop} />
          </View>
          <View style={styles.storyCta}>
            <Ionicons name="footsteps" size={16} color={colors.brand} />
            <Text style={styles.storyCtaText}>View full journey, step by step</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.brand} />
          </View>
        </Pressable>
      )}
      {!journeyStory && !!post.mediaUrl && post.mediaType === 'image' && (
        <Pressable onPress={onMediaPress} accessibilityLabel="Photo. Double-tap to like" testID={`media-${post.id}`}>
          <Image source={{ uri: post.mediaUrl }} style={styles.media} contentFit="cover" transition={250} />
          <HeartPop show={pop} />
        </Pressable>
      )}
      {!journeyStory && !!post.mediaUrl && post.mediaType === 'video' && (
        <VideoPlayer uri={post.mediaUrl} poster={post.thumbUrl} style={[styles.media, styles.video]} testID={`video-${post.id}`} />
      )}
      <Row style={{ marginTop: space.md, justifyContent: 'space-between' }}>
        <Row gap={18}>
          <Row gap={6}>
            <Pressable onPress={like} accessibilityLabel={liked ? 'Unlike' : 'Like'} testID={`like-${post.id}`} hitSlop={8}>
              <Animated.View style={bump}>
                <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? colors.pink : colors.textMuted} />
              </Animated.View>
            </Pressable>
            <Pressable onPress={() => setShowLikers(true)} accessibilityLabel={`See who liked (${likes})`} testID={`likes-count-${post.id}`} hitSlop={8}>
              <Text style={type.small}>{likes}</Text>
            </Pressable>
          </Row>
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
      {likes > 0 && (
        <Pressable onPress={() => setShowLikers(true)} testID={`liked-by-${post.id}`} accessibilityRole="button" style={{ marginTop: 8 }}>
          <Text style={[type.small, { fontWeight: '700' }]}>
            ❤️ Liked by {likes} {likes === 1 ? 'person' : 'people'} · <Text style={{ color: colors.brand }}>See who</Text>
          </Text>
        </Pressable>
      )}
      {showLikers && <LikersSheet postId={post.id} count={likes} visible onClose={() => setShowLikers(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.cardBorder, marginBottom: space.md, ...shadows.soft },
  story: { height: 220, borderRadius: radius.md, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: colors.ink },
  storyTag: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brand, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  storyTagText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  storyTitle: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  storySub: { color: '#ffffffd9', fontSize: 12, fontWeight: '600', marginTop: 2 },
  storyCta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingVertical: 11, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: '#FFC9AA' },
  storyCtaText: { flex: 1, color: colors.brandDark, fontWeight: '800', fontSize: 13 },
  media: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.cardAlt },
  video: { aspectRatio: 9 / 16, maxHeight: 460, backgroundColor: '#000' },
});

// confirmAsync/toast live in Dialogs.tsx (in-app sheets); re-exported for existing imports.
export { confirmAsync, toast };
