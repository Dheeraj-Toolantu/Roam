import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { confirmAsync } from '@/components/PostCard';
import { Avatar, Button, Card, Empty, ErrorText, Field, Header, InfoText, Loading, Pill, Row, Screen, Segmented, type IconName } from '@/components/ui';
import { useSession } from '@/lib/session';
import { loadAdminStats, loadOpenReports, resolveReport, setSuspended, type AdminStats } from '@/services/admin';
import { deletePost, getPost } from '@/services/social';
import { findByUsername, getProfile } from '@/services/users';
import { errorMessage, timeAgo } from '@/services/util';
import { colors, space, type } from '@/theme';
import type { Post, Report, UserProfile } from '@/types';

type Tab = 'analytics' | 'reports' | 'users';

export default function AdminScreen() {
  const { admin } = useSession();
  const [tab, setTab] = useState<Tab>('analytics');

  if (!admin) {
    return (
      <Screen>
        <Header title="Admin" />
        <Empty icon="shield-outline" title="Admins only" text="You do not have access to the administration module." />
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Admin dashboard" subtitle="Moderation & analytics" />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { id: 'analytics', label: 'Analytics' },
          { id: 'reports', label: 'Reports' },
          { id: 'users', label: 'Users' },
        ]}
      />
      <View style={{ height: space.lg }} />
      {tab === 'analytics' ? <Analytics /> : tab === 'reports' ? <Reports /> : <Users />}
    </Screen>
  );
}

function Analytics() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadAdminStats().then(setStats).catch((e) => setError(errorMessage(e)));
  }, []);
  if (error) return <ErrorText text={error} />;
  if (!stats) return <Loading />;
  const tiles: { label: string; value: number; icon: IconName; color: string }[] = [
    { label: 'Registered users', value: stats.users, icon: 'people', color: colors.cyan },
    { label: 'Posts', value: stats.posts, icon: 'images', color: colors.pink },
    { label: 'Journeys created', value: stats.journeys, icon: 'map', color: colors.green },
    { label: 'Group trips', value: stats.groups, icon: 'people-circle', color: colors.violet },
    { label: 'Videos generated', value: stats.travelVideos, icon: 'film', color: colors.orange },
    { label: 'Open reports', value: stats.openReports, icon: 'flag', color: colors.red },
  ];
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {tiles.map((t) => (
          <Card key={t.label} style={{ width: '48.5%' }} testID={`admin-stat-${t.label}`}>
            <Ionicons name={t.icon} size={20} color={t.color} />
            <Text style={[type.h1, { marginTop: 6 }]}>{t.value < 0 ? '—' : t.value.toLocaleString('en-IN')}</Text>
            <Text style={type.tiny}>{t.label}</Text>
          </Card>
        ))}
      </View>
      <View style={{ marginTop: space.md }}>
        <InfoText text="DAU/MAU, retention and failure monitoring come from Firebase Analytics and Crashlytics in production." />
      </View>
    </>
  );
}

function Reports() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [targets, setTargets] = useState<Record<string, Post | UserProfile | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await loadOpenReports();
      setReports(r);
      const t: Record<string, Post | UserProfile | null> = {};
      await Promise.all(
        r.map(async (x) => {
          t[x.id] = x.targetType === 'post' ? await getPost(x.targetId) : x.targetType === 'user' ? await getProfile(x.targetId) : null;
        }),
      );
      setTargets(t);
    } catch (e) {
      setError(errorMessage(e));
      setReports([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (r: Report, action: 'remove' | 'suspend' | 'dismiss') => {
    setBusy(r.id + action);
    setError(null);
    try {
      if (action === 'remove') {
        if (!(await confirmAsync('Remove content', 'Delete this post permanently?', 'Remove'))) return;
        if (r.targetType === 'post') await deletePost(r.targetId).catch(() => {});
        await resolveReport(r.id, 'actioned');
      } else if (action === 'suspend') {
        const uid = r.targetOwnerId ?? (r.targetType === 'user' ? r.targetId : null);
        if (!uid) throw new Error('No account linked to this report');
        if (!(await confirmAsync('Suspend account', 'Suspend this account? They will be locked out of ROAM.', 'Suspend'))) return;
        await setSuspended(uid, true, r.reason);
        await resolveReport(r.id, 'actioned');
      } else {
        await resolveReport(r.id, 'dismissed');
      }
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (!reports) return <Loading />;
  return (
    <>
      <ErrorText text={error} />
      {reports.length === 0 ? (
        <Empty icon="checkmark-done" title="No open reports" text="The moderation queue is clear." />
      ) : (
        reports.map((r) => {
          const t = targets[r.id];
          return (
            <Card key={r.id} style={{ marginBottom: space.md }} testID={`report-${r.id}`}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Pill text={r.targetType} icon="flag" color={colors.orange} />
                <Text style={type.tiny}>{timeAgo(r.createdAt)}</Text>
              </Row>
              <Text style={[type.small, { marginTop: 8 }]}>Reason: {r.reason}</Text>
              <View style={{ backgroundColor: colors.cardAlt, borderRadius: 12, padding: 10, marginTop: 8 }}>
                {t == null ? (
                  <Text style={type.tiny}>Content no longer available.</Text>
                ) : 'authorName' in t ? (
                  <>
                    <Text style={type.h3}>{t.authorName}</Text>
                    <Text style={type.body}>{t.text || '(media post)'}</Text>
                  </>
                ) : (
                  <Row>
                    <Avatar name={t.displayName} uri={t.photoURL} size={32} />
                    <Text style={type.h3}>
                      {t.displayName} <Text style={type.tiny}>@{t.username}</Text>
                    </Text>
                  </Row>
                )}
              </View>
              <Row style={{ marginTop: space.md, flexWrap: 'wrap' }}>
                {r.targetType === 'post' && (
                  <Button title="Remove content" small variant="danger" loading={busy === r.id + 'remove'} onPress={() => act(r, 'remove')} testID="admin-remove" />
                )}
                <Button title="Suspend user" small variant="secondary" loading={busy === r.id + 'suspend'} onPress={() => act(r, 'suspend')} testID="admin-suspend" />
                <Button title="Dismiss" small variant="ghost" loading={busy === r.id + 'dismiss'} onPress={() => act(r, 'dismiss')} testID="admin-dismiss" />
              </Row>
            </Card>
          );
        })
      )}
    </>
  );
}

function Users() {
  const [username, setUsername] = useState('');
  const [user, setUser] = useState<UserProfile | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setError(null);
    setUser(undefined);
    try {
      setUser(await findByUsername(username));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const toggle = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await setSuspended(user.uid, !user.suspended, 'Suspended by administrator');
      setUser(await getProfile(user.uid));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Row style={{ alignItems: 'flex-start' }}>
        <Field style={{ flex: 1 }} icon="at" placeholder="username" autoCapitalize="none" value={username} onChangeText={setUsername} onSubmitEditing={search} testID="admin-user-search" />
        <Button title="Find" small onPress={search} style={{ marginTop: 6 }} testID="admin-user-find" />
      </Row>
      <ErrorText text={error} />
      {user === null && <Empty icon="person-outline" title="No user with that username" />}
      {user && (
        <Card>
          <Row>
            <Avatar name={user.displayName} uri={user.photoURL} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={type.h3}>{user.displayName}</Text>
              <Text style={type.tiny}>
                @{user.username} · {user.visibility} · {user.followersCount} followers
              </Text>
            </View>
            {user.suspended && <Pill text="Suspended" color={colors.red} />}
          </Row>
          <Button
            title={user.suspended ? 'Restore account' : 'Suspend account'}
            variant={user.suspended ? 'success' : 'danger'}
            small
            loading={busy}
            onPress={toggle}
            style={{ marginTop: space.md }}
            testID="admin-toggle-suspend"
          />
        </Card>
      )}
    </>
  );
}
