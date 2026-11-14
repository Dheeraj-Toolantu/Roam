import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { AuthShell, SocialButtons } from '@/components/AuthShell';
import { Button, ErrorText, Field, IconButton } from '@/components/ui';
import { signUpWithEmail, useSession } from '@/lib/session';
import { errorMessage } from '@/services/util';
import { colors, type } from '@/theme';

export default function SignUp() {
  const { user } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (user) return <Redirect href="/" />;

  const submit = async () => {
    setErr(null);
    if (!name.trim()) return setErr('Please enter your name');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Please enter a valid email address');
    if (password.length < 8) return setErr('Use at least 8 characters for your password');
    setBusy(true);
    try {
      await signUpWithEmail(name, email, password);
      router.replace('/profile-setup');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create Your Account">
      <SocialButtons />
      <Field testID="signup-name" icon="person-outline" placeholder="Full name" value={name} onChangeText={setName} autoComplete="name" />
      <Field
        testID="signup-email"
        icon="mail-outline"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <Field
        testID="signup-password"
        icon="lock-closed-outline"
        placeholder="Password (min 8 characters)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!show}
        onSubmitEditing={submit}
        right={<IconButton icon={show ? 'eye-off-outline' : 'eye-outline'} onPress={() => setShow(!show)} style={{ backgroundColor: 'transparent', borderWidth: 0 }} accessibilityLabel="Toggle password visibility" />}
      />
      <ErrorText text={err} />
      <Button testID="signup-submit" title="Sign Up" onPress={submit} loading={busy} style={{ marginTop: 8 }} />
      <Pressable onPress={() => router.replace('/login')} style={{ alignItems: 'center', marginTop: 18 }}>
        <Text style={type.small}>
          Already have an account? <Text style={{ color: colors.cyan, fontWeight: '700' }}>Login</Text>
        </Text>
      </Pressable>
      <Text style={[type.tiny, { textAlign: 'center', marginTop: 18 }]}>
        By signing up you agree to ROAM&apos;s Terms and Privacy Policy. Location is only recorded during a journey you start.
      </Text>
    </AuthShell>
  );
}
