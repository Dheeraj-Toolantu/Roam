import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { subscribeLikers, type Liker } from '../services/social';
import { timeAgo } from '../services/util';
import { colors, radius, type } from '../theme';
import { Avatar, Row } from './ui';

/** Bottom sheet listing everyone who liked a post (photo, video or text). */
export function LikersSheet({ postId, count, visible, onClose }: { postId: string; count: number; visible: boolean; onClose: () => void }) {
  const [likers, setLikers] = useState<Liker[] | null>(null);
  useEffect(() => (visible ? subscribeLikers(postId, setLikers) : undefined), [visible, postId]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close likes" />
      <View style={styles.sheet} testID="likers-sheet">
        <View style={styles.grip} />
        <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={type.h3}>❤️ Liked by {likers ? likers.length : count}</Text>
          <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={10}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </Row>
        {likers === null ? (
          <Text style={type.small}>Loading…</Text>
        ) : likers.length === 0 ? (
          <Text style={type.small} testID="likers-empty">No likes yet — be the first!</Text>
        ) : (
          <FlatList
            data={likers}
            keyExtractor={(l) => l.uid}
            style={{ maxHeight: 420 }}
            renderItem={({ item }) => (
              <Pressable
                testID={`liker-${item.uid}`}
                onPress={() => {
                  onClose();
                  router.push(`/user/${item.uid}`);
                }}
                style={styles.row}>
                <Avatar name={item.name} uri={item.photoURL} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontWeight: '800' }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {!!item.username && <Text style={type.tiny}>@{item.username}</Text>}
                </View>
                <Text style={type.tiny}>{timeAgo(item.at)}</Text>
                <Ionicons name="heart" size={16} color={colors.pink} />
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 18,
    paddingBottom: 34,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  grip: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.cardBorder, alignSelf: 'center', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
});
