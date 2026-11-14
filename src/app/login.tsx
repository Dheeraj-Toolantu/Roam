import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AuthShell, SocialButtons } from '@/components/AuthShell';
import { Button, ErrorText, Field, IconButton, InfoText } from '@/components/ui';
import { resetPassword, signInWithEmail, useSession, USE_EMULATORS } from '@/lib/session';
import { errorMessage } from '@/services/util';
import { colors, type } from '@/theme';

export default function Login() {
  const { user } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (user) return <Redirect href="/" />;

  const submit = async () => {
    setErr(null);
    setInfo(null);
    if (!email.trim() || !password) return setErr('Enter your email and password');
    setBusy(true);
    try {
      await signInWithEmail(email, password);
      router.replace('/');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    setErr(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Enter your email above, then tap “Forgot password”.');
    try {
      await resetPassword(email);
      setInfo(`If an account exists for ${email.trim()}, a reset link has been sent.`);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  return (
    <AuthShell title="Welcome back">
      <SocialButtons />
      <Field testID="login-email" icon="mail-outline" placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field
        testID="login-password"
        icon="lock-closed-outline"
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry={!show}
        onSubmitEditing={submit}
        right={<IconButton icon={show ? 'eye-off-outline' : 'eye-outline'} onPress={() => setShow(!show)} style={{ backgroundColor: 'transparent', borderWidth: 0 }} accessibilityLabel="Toggle password visibility" />}
      />
      <Pressable onPress={forgot} style={{ alignSelf: 'flex-end', marginBottom: 8 }} testID="forgot-password">
        <Text style={{ color: colors.cyan, fontWeight: '600', fontSize: 13 }}>Forgot password?</Text>
      </Pressable>
      <ErrorText text={err} />
      {!!info && <InfoText text={info} icon="mail" />}
      <Button testID="login-submit" title="Login" onPress={submit} loading={busy} style={{ marginTop: 8 }} />
      <Pressable onPress={() => router.replace('/signup')} style={{ alignItems: 'center', marginTop: 18 }}>
        <Text style={type.small}>
          New to ROAM? <Text style={{ color: colors.cyan, fontWeight: '700' }}>Create an account</Text>
        </Text>
      </Pressable>
      {USE_EMULATORS && (
        <View style={{ marginTop: 20 }}>
          <InfoText text="Running against the local Firebase emulators (demo-roam)." icon="construct" />
        </View>
      )}
    </AuthShell>
  );
}
