import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { signInWithProvider } from '../lib/session';
import { errorMessage } from '../services/util';
import { colors, radius, type } from '../theme';
import { ErrorText, Logo, Row, Screen, Wordmark } from './ui';

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Screen edges={['top', 'bottom']} contentStyle={{ paddingTop: 40 }}>
      <View style={{ alignItems: 'center', marginBottom: 28 }}>
        <Logo size={64} />
        <View style={{ height: 10 }} />
        <Wordmark size={36} />
        <Text style={[type.h3, { marginTop: 10, fontWeight: '600' }]}>{title}</Text>
      </View>
      {children}
    </Screen>
  );
}

export function SocialButtons() {
  const [err, setErr] = useState<string | null>(null);
  const go = async (k: 'google' | 'apple') => {
    setErr(null);
    try {
      await signInWithProvider(k);
      router.replace('/');
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <SocialBtn label="Continue with Google" icon="logo-google" color="#EA4335" onPress={() => go('google')} />
      <SocialBtn label="Continue with Apple" icon="logo-apple" color="#000" onPress={() => go('apple')} />
      <ErrorText text={err} />
      <Row style={{ marginVertical: 8 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.cardBorder }} />
        <Text style={type.small}>or</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.cardBorder }} />
      </Row>
    </View>
  );
}

function SocialBtn({ label, icon, color, onPress }: { label: string; icon: 'logo-google' | 'logo-apple'; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        backgroundColor: '#fff',
        borderRadius: radius.md,
        height: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        opacity: pressed ? 0.85 : 1,
      })}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={{ color: '#111', fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}
