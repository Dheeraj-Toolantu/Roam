import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '../theme';

type Props = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Small tile (grid / timeline thumbnail): shows the first frame with a play badge; tap opens a full-screen player. */
  compact?: boolean;
};

/**
 * Plays an uploaded clip (Firebase Storage download URL or a local picker URI)
 * with the platform's native controls. Works on iOS, Android and web (<video>).
 */
export function VideoPlayer({ uri, style, testID, compact }: Props) {
  const [open, setOpen] = useState(false);
  if (compact) {
    return (
      <>
        <Pressable onPress={() => setOpen(true)} style={[styles.box, style]} accessibilityRole="button" accessibilityLabel="Play video" testID={testID}>
          <InlineVideo uri={uri} controls={false} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.badge} pointerEvents="none">
            <Ionicons name="play" size={18} color="#fff" />
          </View>
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
  return <InlineVideo uri={uri} controls style={[styles.box, style]} testID={testID} />;
}

function InlineVideo({
  uri,
  controls,
  autoPlay,
  style,
  contentFit = 'contain',
  testID,
}: {
  uri: string;
  controls: boolean;
  autoPlay?: boolean;
  style?: StyleProp<ViewStyle>;
  contentFit?: 'contain' | 'cover';
  testID?: string;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    if (autoPlay) p.play();
    else p.muted = !controls; // silent first-frame thumbnails
  });
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
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: '#000', overflow: 'hidden' },
  badge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -18,
    marginLeft: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  full: { width: '100%', aspectRatio: 9 / 16, maxHeight: '90%', alignSelf: 'center' },
  close: { position: 'absolute', top: 44, right: 16, backgroundColor: colors.overlay, borderRadius: 20, padding: 8 },
});
