import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Empty, Header, Loading, Row, Screen, type IconName } from '@/components/ui';
import { useMe } from '@/lib/session';
import { markAllRead, markRead, subscribeNotifications } from '@/services/notifications';
import { timeAgo } from '@/services/util';
import { colors, radius, space, type } from '@/theme';
import type { AppNotification, NotificationType } from '@/types';

const ICON: Record<NotificationType, IconName> = {
  follow: 'person-add',
  like: 'heart',
  comment: 'chatbubble',
  invite: 'mail',
  inviteAccepted: 'people',
  groupActivity: 'images',
  video: 'film',
  expense: 'receipt',
  settlement: 'cash',
  budget: 'wallet',
};

export default function NotificationsScreen() {
  const me = useMe();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  useEffect(() => subscribeNotifications(me.uid, setItems), [me.uid]);

  const visible = (items ?? []).filter((n) => me.notificationPrefs?.[n.type] !== false);
  const unread = visible.filter((n) => !n.read).length;

  const open = async (n: AppNotification) => {
    if (!n.read) markRead(me.uid, n.id).catch(() => {});
    if (n.link) router.push(n.link as Href);
  };

  return (
    <Screen>
      <Header
        title="Notifications"
        subtitle={unread ? `${unread} unread` : 'All caught up'}
        right={unread ? <Button title="Mark all read" small variant="secondary" onPress={() => markAllRead(me.uid, visible)} testID="mark-all-read" /> : undefined}
      />
      {items === null ? (
        <Loading />
      ) : visible.length === 0 ? (
        <Empty icon="notifications-outline" title="No notifications yet" text="Follows, likes, crew activity and expenses will show up here." />
      ) : (
        visible.map((n) => (
          <Pressable key={n.id} onPress={() => open(n)} style={[styles.row, !n.read && styles.unread]} testID={`notification-${n.id}`}>
            <View>
              <Avatar name={n.fromName} size={42} />
              <View style={styles.typeIcon}>
                <Ionicons name={ICON[n.type] ?? 'notifications'} size={11} color="#fff" />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontSize: 14 }]}>{n.text}</Text>
              <Text style={type.tiny}>{timeAgo(n.createdAt)}</Text>
            </View>
            {!n.read && <View style={styles.dot} />}
          </Pressable>
        ))
      )}
      <Row style={{ justifyContent: 'center', marginTop: space.lg }}>
        <Pressable onPress={() => router.push('/settings')}>
          <Text style={{ color: colors.cyan, fontWeight: '600' }}>Notification preferences</Text>
        </Pressable>
      </Row>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.md, borderRadius: radius.md, marginBottom: space.sm, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder },
  unread: { borderColor: colors.cyan + '66', backgroundColor: colors.cardAlt },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.cyan },
  typeIcon: { position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
});
