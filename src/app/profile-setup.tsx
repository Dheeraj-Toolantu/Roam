import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar, Button, Chip, ErrorText, Field, Header, Row, Screen } from '@/components/ui';
import { CITIES } from '@/data/cities';
import { signOut, useSession } from '@/lib/session';
import { pickMedia, uploadMedia } from '@/services/media';
import { completeProfile, isUsernameAvailable, normaliseUsername, USERNAME_RE } from '@/services/users';
import { errorMessage } from '@/services/util';
import { colors, type } from '@/theme';

export default function ProfileSetup() {
  const { user, profile, loading } = useSession();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [homeCity, setHomeCity] = useState('');
  const [homeCountry, setHomeCountry] = useState('India');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [photo, setPhoto] = useState<string | null>(null);
  const [avail, setAvail] = useState<null | boolean>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName((d) => d || profile.displayName);
      setPhoto((p) => p ?? profile.photoURL);
      if (!username && profile.displayName) setUsername(normaliseUsername(profile.displayName.replace(/\s+/g, '.')).replace(/[^a-z0-9_.]/g, '').slice(0, 20));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid]);

  useEffect(() => {
    const u = normaliseUsername(username);
    if (!user || !USERNAME_RE.test(u)) return setAvail(null);
    const t = setTimeout(() => isUsernameAvailable(u, user.uid).then(setAvail).catch(() => setAvail(null)), 350);
    return () => clearTimeout(t);
  }, [username, user]);

  if (!loading && !user) return <Redirect href="/login" />;
  if (profile?.onboarded) return <Redirect href="/" />;

  const pickAvatar = async () => {
    try {
      const m = await pickMedia('library', 'images');
      if (!m || !user) return;
      setBusy(true);
      setPhoto(await uploadMedia(user.uid, m, 'avatars'));
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!user) return;
    setErr(null);
    if (!displayName.trim()) return setErr('Please enter a display name');
    setBusy(true);
    try {
      await completeProfile(user.uid, { displayName, username, bio, homeCity, homeCountry, visibility, photoURL: photo });
      router.replace('/');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Set up your profile" subtitle="Tell travellers who you are" back={false} right={<Button small variant="ghost" title="Sign out" onPress={() => signOut()} />} />
      <Pressable onPress={pickAvatar} style={{ alignSelf: 'center', alignItems: 'center', marginBottom: 20 }}>
        <Avatar name={displayName || 'R'} uri={photo} size={96} ring />
        <Text style={{ color: colors.cyan, marginTop: 8, fontWeight: '600' }}>Add photo</Text>
      </Pressable>
      <Field testID="setup-name" label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Dheeraj Vishwakarma" />
      <Field
        testID="setup-username"
        label="Username"
        value={username}
        onChangeText={(t) => setUsername(t.toLowerCase())}
        autoCapitalize="none"
        placeholder="dheeraj.travels"
        icon="at"
        right={
          avail == null ? null : (
            <Text style={{ color: avail ? colors.green : colors.red, fontSize: 12, fontWeight: '700' }}>{avail ? 'Available' : 'Taken'}</Text>
          )
        }
      />
      <Field label="Bio" value={bio} onChangeText={setBio} placeholder="Chasing sunsets across the globe 🌍" multiline maxLength={160} />
      <Field testID="setup-city" label="Home city" value={homeCity} onChangeText={setHomeCity} placeholder="Mumbai" icon="home-outline" />
      <Row style={{ flexWrap: 'wrap', marginTop: -4, marginBottom: 12 }}>
        {CITIES.filter((c) => c.countryCode === 'IN')
          .slice(0, 5)
          .map((c) => (
            <Chip key={c.id} label={c.name} active={homeCity === c.name} onPress={() => { setHomeCity(c.name); setHomeCountry(c.country); }} />
          ))}
      </Row>
      <Field label="Home country" value={homeCountry} onChangeText={setHomeCountry} icon="flag-outline" />
      <Text style={[type.small, { fontWeight: '600', marginBottom: 8 }]}>Account visibility</Text>
      <Row style={{ marginBottom: 6 }}>
        <Chip label="Public" icon="earth" active={visibility === 'public'} onPress={() => setVisibility('public')} />
        <Chip label="Private" icon="lock-closed" active={visibility === 'private'} onPress={() => setVisibility('private')} />
      </Row>
      <Text style={[type.tiny, { marginBottom: 16 }]}>
        {visibility === 'public'
          ? 'Anyone on ROAM can see your profile and public stories.'
          : 'Only approved followers can see your profile. Your precise location is always private.'}
      </Text>
      <ErrorText text={err} />
      <View style={{ height: 8 }} />
      <Button testID="setup-submit" title="Start exploring" iconRight="arrow-forward" onPress={save} loading={busy} />
    </Screen>
  );
}
