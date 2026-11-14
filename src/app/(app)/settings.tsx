import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { confirmAsync, toast } from '@/components/PostCard';
import { BackgroundLocationCard } from '@/components/BackgroundLocationCard';
import { Avatar, Button, Card, Chip, ErrorText, Field, Header, InfoText, Row, Screen, SectionTitle, Segmented, Toggle } from '@/components/ui';
import { signOut, useMe, useSession } from '@/lib/session';
import { clearLocationHistory, setPresence } from '@/services/journeys';
import { pickMedia, uploadMedia } from '@/services/media';
import { DEFAULT_NOTIFICATION_PREFS, updateProfile } from '@/services/users';
import { errorMessage } from '@/services/util';
import { colors, space, type } from '@/theme';
import type { NotificationType, Visibility } from '@/types';

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const NOTIF_LABELS: Record<NotificationType, string> = {
  follow: 'New followers',
  like: 'Likes',
  comment: 'Comments',
  invite: 'Group invitations',
  inviteAccepted: 'Invitation accepted',
  groupActivity: 'New group activities & media',
  video: 'New cinematic videos',
  expense: 'Expense additions',
  settlement: 'Settlements & reminders',
  budget: 'Budget alerts',
};

const VIS: { id: Visibility; label: string }[] = [
  { id: 'private', label: 'Only me' },
  { id: 'followers', label: 'Followers' },
  { id: 'public', label: 'Public' },
];

export default function SettingsScreen() {
  const me = useMe();
  const { admin } = useSession();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio ?? '');
  const [homeCity, setHomeCity] = useState(me.homeCity ?? '');
  const [homeCountry, setHomeCountry] = useState(me.homeCountry ?? 'India');
  const [visibility, setVisibility] = useState<'public' | 'private'>(me.visibility);
  const [defaultVis, setDefaultVis] = useState<Visibility>(me.defaultPostVisibility ?? 'followers');
  const [live, setLive] = useState(!!me.appearInLiveWorld);
  const [prefs, setPrefs] = useState<Record<NotificationType, boolean>>({ ...DEFAULT_NOTIFICATION_PREFS, ...(me.notificationPrefs ?? {}) });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (!displayName.trim()) {
      setError('Display name cannot be empty');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateProfile(me.uid, {
        displayName: displayName.trim(),
        bio: bio.trim(),
        homeCity: homeCity.trim(),
        homeCountry: homeCountry.trim() || 'India',
        visibility,
        defaultPostVisibility: defaultVis,
        appearInLiveWorld: live,
        notificationPrefs: prefs,
      });
      if (!live) await setPresence(me.uid, me.displayName, null, false).catch(() => {});
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const changeAvatar = async () => {
    setError(null);
    try {
      const m = await pickMedia('library', 'images');
      if (!m) return;
      setUploading(true);
      const url = await uploadMedia(me.uid, m, 'avatars');
      await updateProfile(me.uid, { photoURL: url });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const clearHistory = async () => {
    if (!(await confirmAsync('Delete location history', 'Permanently delete the GPS history of all your journeys? Your photos, activities and statistics are kept.', 'Delete'))) return;
    setClearing(true);
    setError(null);
    try {
      const s = await getDocs(query(collection(db, 'journeys'), where('ownerId', '==', me.uid)));
      for (const d of s.docs) await clearLocationHistory(d.id);
      toast(`Location history deleted for ${s.size} ${s.size === 1 ? 'journey' : 'journeys'}.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setClearing(false);
    }
  };

  return (
    <Screen>
      <Header title="Settings" subtitle="Profile, privacy & notifications" />

      <SectionTitle title="Profile" />
      <Card>
        <Row style={{ marginBottom: space.lg }}>
          <Avatar name={displayName} uri={me.photoURL} size={64} ring />
          <Button title={uploading ? 'Uploading…' : 'Change photo'} small variant="secondary" icon="camera" loading={uploading} onPress={changeAvatar} />
        </Row>
        <Field label="Display name" value={displayName} onChangeText={setDisplayName} testID="settings-name" maxLength={60} />
        <Field label="Username" value={`@${me.username}`} editable={false} />
        <Field label="Bio" value={bio} onChangeText={setBio} multiline maxLength={160} placeholder="Tell travellers about yourself" testID="settings-bio" />
        <Field label="Home city" value={homeCity} onChangeText={setHomeCity} placeholder="e.g. Mumbai" />
        <Field label="Home country" value={homeCountry} onChangeText={setHomeCountry} placeholder="India" />
      </Card>

      <SectionTitle title="Privacy" />
      <Card>
        <Text style={[type.small, { marginBottom: 8 }]}>Account visibility</Text>
        <Segmented
          value={visibility}
          onChange={setVisibility}
          options={[
            { id: 'public', label: 'Public' },
            { id: 'private', label: 'Private' },
          ]}
        />
        <Text style={[type.small, { marginTop: space.lg, marginBottom: 8 }]}>Default visibility for new posts</Text>
        <Row style={{ flexWrap: 'wrap' }}>
          {VIS.map((v) => (
            <Chip key={v.id} label={v.label} active={defaultVis === v.id} onPress={() => setDefaultVis(v.id)} testID={`default-vis-${v.id}`} />
          ))}
        </Row>
        <View style={{ marginTop: space.md }}>
          <Toggle
            label="Appear in Live World"
            hint="Shows only the city you are in while a journey is active."
            value={live}
            onChange={setLive}
            testID="toggle-live-world"
          />
        </View>
        <InfoText icon="shield-checkmark" text="Your precise location is never public. GPS history is visible only to you, and joining a crew never shares your live location." />
      </Card>

      <SectionTitle title="Background location" />
      <BackgroundLocationCard />

      <SectionTitle title="Notifications" />
      <Card style={{ paddingVertical: space.sm }}>
        {(Object.keys(NOTIF_LABELS) as NotificationType[]).map((k) => (
          <Toggle key={k} label={NOTIF_LABELS[k]} value={prefs[k] !== false} onChange={(v) => setPrefs((p) => ({ ...p, [k]: v }))} testID={`notif-${k}`} />
        ))}
      </Card>

      <ErrorText text={error} />
      {saved && <InfoText icon="checkmark-circle" text="Settings saved." />}
      <Button title="Save changes" icon="checkmark" loading={saving} onPress={save} style={{ marginTop: space.md }} testID="settings-save" />

      <SectionTitle title="Your data" />
      <Card>
        <Text style={type.small}>Delete the stored GPS points of every journey. Journeys, photos and statistics remain.</Text>
        <Button title="Delete all location history" variant="danger" icon="trash" small loading={clearing} onPress={clearHistory} style={{ marginTop: space.md }} testID="delete-location-history" />
      </Card>

      <SectionTitle title="About" />
      <Card>
        <Text style={type.small}>
          ROAM 2.0 is private by default. You control the visibility of every journey, activity and post, and can delete your content at any time.
          We process personal data in line with applicable data-protection law, including India’s Digital Personal Data Protection (DPDP) Act.
        </Text>
      </Card>

      {admin && (
        <Pressable onPress={() => router.push('/admin')} style={{ marginTop: space.lg }}>
          <Row>
            <Ionicons name="shield" size={18} color={colors.cyan} />
            <Text style={{ color: colors.cyan, fontWeight: '700' }}>Open admin dashboard</Text>
          </Row>
        </Pressable>
      )}

      <Button
        title="Sign out"
        icon="log-out-outline"
        variant="ghost"
        style={{ marginTop: space.xl }}
        onPress={async () => {
          if (await confirmAsync('Sign out', 'Sign out of ROAM on this device?', 'Sign out')) await signOut();
        }}
      />
    </Screen>
  );
}
