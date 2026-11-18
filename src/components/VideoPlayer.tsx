import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '../theme';

type Props = {
  uri: string;
  /** Still frame shown until the video is played (uploaded with the clip). */
  poster?: string | null;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Small tile (grid / timeline): thumbnail + play badge; tap opens a full-screen player. */
  compact?: boolean;
  /** Mount the player straight away with controls (local preview before upload). */
  immediate?: boolean;
  /** Start playing (muted) as soon as it's on screen — story viewer. */
  autoPlay?: boolean;
};

/**
 * Plays an uploaded clip (Firebase Storage download URL or a local picker URI).
 *
 * Feeds show the thumbnail with a play button and only create the player when tapped,
 * so a long feed never loads many videos at once and nothing shows up as a black box
 * (mobile browsers don't paint a first frame before playback). Works on iOS, Android and web.
 */
export function VideoPlayer({ uri, poster, style, testID, compact, immediate, autoPlay }: Props) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);

  if (immediate) return <InlineVideo uri={uri} controls style={[styles.box, style]} testID={testID} />;
  if (autoPlay) return <InlineVideo uri={uri} controls={false} autoPlay muted loop style={[styles.box, style]} testID={testID} poster={poster} />;

  if (compact) {
    return (
      <>
        <Pressable onPress={() => setOpen(true)} style={[styles.box, style]} accessibilityRole="button" accessibilityLabel="Play video" testID={testID}>
          <Poster poster={poster} small />
        </Pressable>
        {open && (
          <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
            <View style={styles.backdrop}>
              <InlineVideo uri={uri} controls autoPlay style={styles.full} testID={testID ? `${testID}-full` : undefined} />
              <Pressable onPress={() => setOpen(false)} style={styles.close} accessibilityLabel="Close video" testID="video-close">
                <Ionicons name="close" size={22} color="#fff" />
              </Pressable>
            </View>
          </Modal>
        )}
      </>
    );
  }

  return (
    <View style={[styles.box, style]} testID={testID}>
      {playing ? (
        <InlineVideo uri={uri} controls autoPlay style={StyleSheet.absoluteFill} poster={poster} />
      ) : (
        <Pressable onPress={() => setPlaying(true)} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Play video" testID={testID ? `${testID}-play` : undefined}>
          <Poster poster={poster} />
        </Pressable>
      )}
    </View>
  );
}

/** Thumbnail (or a branded placeholder for clips uploaded before thumbnails existed) + play button. */
function Poster({ poster, small }: { poster?: string | null; small?: boolean }) {
  const s = small ? 36 : 64;
  return (
    <View style={StyleSheet.absoluteFill}>
      {poster ? (
        <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <LinearGradient colors={['#1B1838', '#3F3774']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient colors={['transparent', '#00000066']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[styles.play, { width: s, height: s, borderRadius: s / 2, marginTop: -s / 2, marginLeft: -s / 2 }]} pointerEvents="none">
        <Ionicons name="play" size={small ? 18 : 30} color={colors.brand} style={{ marginLeft: small ? 2 : 4 }} />
      </View>
      {!small && (
        <View style={styles.tag} pointerEvents="none">
          <Ionicons name="videocam" size={12} color="#fff" />
          <Text style={styles.tagText}>Video</Text>
        </View>
      )}
    </View>
  );
}

function InlineVideo({
  uri,
  controls,
  autoPlay,
  muted,
  loop,
  poster,
  style,
  contentFit = 'contain',
  testID,
}: {
  uri: string;
  controls: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  poster?: string | null;
  style?: StyleProp<ViewStyle>;
  contentFit?: 'contain' | 'cover';
  testID?: string;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = !!loop;
    p.muted = !!muted;
    if (autoPlay) p.play();
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const failed = status === 'error';
  return (
    <View style={style} testID={testID}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls={controls}
        contentFit={contentFit}
        fullscreenOptions={{ enable: controls }}
        allowsPictureInPicture={false}
        playsInline
      />
      {/* Keep the thumbnail up until the first frame is actually playing. */}
      {!!poster && autoPlay && !isPlaying && status !== 'readyToPlay' && !failed && (
        <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" pointerEvents="none" />
      )}
      {status === 'loading' && autoPlay && (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator color="#fff" />
        </View>
      )}
      {failed && (
        <View style={[styles.center, { backgroundColor: '#000000AA', gap: 6 }]} pointerEvents="none" testID="video-error">
          <Ionicons name="alert-circle" size={26} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center', paddingHorizontal: 16 }}>This video can&apos;t be played on this device.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: '#000', overflow: 'hidden' },
  play: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  tag: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#00000080', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  tagText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  full: { width: '100%', aspectRatio: 9 / 16, maxHeight: '90%', alignSelf: 'center' },
  close: { position: 'absolute', top: 44, right: 16, backgroundColor: colors.overlay, borderRadius: 20, padding: 8 },
});
