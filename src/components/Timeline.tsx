import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { colors, radius, type } from '../theme';
import type { Activity } from '../types';
import { Appear } from './motion';
import { VideoPlayer } from './VideoPlayer';
import { Row, type IconName } from './ui';

const ICON: Record<Activity['type'], IconName> = {
  start: 'flag',
  end: 'checkmark-done',
  photo: 'camera',
  video: 'videocam',
  place: 'location',
  review: 'star',
  note: 'create',
};
const COLOR: Record<Activity['type'], string> = {
  start: colors.green,
  end: colors.violet,
  photo: colors.cyan,
  video: colors.pink,
  place: colors.orange,
  review: colors.yellow,
  note: colors.blue,
};

export function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/** Chronological activity timeline (BRD §6, AC-004). */
export function ActivityTimeline({ items, onPress }: { items: Activity[]; onPress?: (a: Activity) => void }) {
  const dayOf = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <View>
      {items.map((a, i) => {
        const day = dayOf(a.createdAt);
        const showDay = i === 0 || day !== dayOf(items[i - 1].createdAt);
        return (
          <Appear key={a.id} index={i}>
            {showDay && <Text style={[type.tiny, { marginVertical: 8, fontWeight: '700', color: colors.cyan }]}>{day.toUpperCase()}</Text>}
            <Pressable onPress={() => onPress?.(a)} testID={`activity-${a.type}`}>
              <Row gap={12} style={{ alignItems: 'flex-start' }}>
                <View style={{ alignItems: 'center', width: 26 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: COLOR[a.type] + '33', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={ICON[a.type]} size={14} color={COLOR[a.type]} />
                  </View>
                  {i < items.length - 1 && <View style={{ width: 2, flex: 1, minHeight: 30, backgroundColor: colors.cardBorder }} />}
                </View>
                <View style={{ flex: 1, paddingBottom: 16 }}>
                  <Text style={type.tiny}>{fmtTime(a.createdAt)}</Text>
                  <Text style={type.h3}>{a.title}</Text>
                  {!!(a.placeName || a.city) && a.type !== 'place' && (
                    <Text style={type.small}>{[a.placeName, a.city].filter(Boolean).join(', ')}</Text>
                  )}
                  {a.type === 'place' && !!a.city && <Text style={type.small}>{a.city}</Text>}
                  {a.rating != null && (
                    <Row gap={2}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Ionicons key={s} name={s <= (a.rating ?? 0) ? 'star' : 'star-outline'} size={12} color={colors.yellow} />
                      ))}
                    </Row>
                  )}
                  {!!a.caption && <Text style={[type.small, { color: colors.text, marginTop: 2 }]}>{a.caption}</Text>}
                  {!!a.mediaUrl && a.type === 'photo' && (
                    <Image source={{ uri: a.mediaUrl }} style={{ width: '100%', height: 160, borderRadius: radius.md, marginTop: 8 }} contentFit="cover" />
                  )}
                  {!!a.mediaUrl && a.type === 'video' && (
                    <VideoPlayer uri={a.mediaUrl} style={{ width: '100%', height: 200, borderRadius: radius.md, marginTop: 8 }} testID={`activity-video-${a.id}`} />
                  )}
                  {a.visibility !== 'private' && (
                    <Row gap={4} style={{ marginTop: 4 }}>
                      <Ionicons name="eye-outline" size={11} color={colors.textDim} />
                      <Text style={type.tiny}>Shared · {a.visibility}</Text>
                    </Row>
                  )}
                </View>
              </Row>
            </Pressable>
          </Appear>
        );
      })}
    </View>
  );
}
