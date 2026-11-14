import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile,
  type User,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { ensureUserDoc, isAdmin as checkAdmin, subscribeProfile } from '../services/users';
import { backgroundLocation } from '../services/backgroundLocation';
import { liveShare } from '../services/liveShare';
import { tracker } from '../services/tracker';
import type { UserProfile } from '../types';
import { ONBOARDING_KEY } from './constants';
import { auth, USE_EMULATORS } from './firebase';

interface Session {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  admin: boolean;
}

const Ctx = createContext<Session>({ user: null, profile: null, loading: true, admin: false });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [admin, setAdmin] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setAuthReady(true);
        // Anyone who has signed in on this device goes to Login (not onboarding) after signing out.
        if (u) AsyncStorage.setItem(ONBOARDING_KEY, '1').catch(() => {});
        if (!u) {
          setProfile(null);
          setProfileReady(true);
          setAdmin(false);
        }
      }),
    [],
  );

  useEffect(() => {
    if (!user) return;
    setProfileReady(false);
    let unsub = () => {};
    let cancelled = false;
    (async () => {
      try {
        await ensureUserDoc(user.uid, user.displayName ?? '', user.photoURL ?? null);
      } catch (e) {
        console.warn('ensureUserDoc failed', e);
      }
      if (cancelled) return;
      unsub = subscribeProfile(user.uid, (p) => {
        setProfile(p);
        setProfileReady(true);
      });
      checkAdmin(user.uid).then(setAdmin);
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, [user]);

  const value = useMemo(
    () => ({ user, profile, loading: !authReady || (!!user && !profileReady), admin }),
    [user, profile, authReady, profileReady, admin],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

/** For screens that are only reachable when signed in and onboarded. */
export function useMe(): UserProfile {
  const { profile } = useSession();
  if (!profile) throw new Error('useMe() called without a signed-in profile');
  return profile;
}

// ---------------- auth actions ----------------

export async function signUpWithEmail(name: string, email: string, password: string) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await fbUpdateProfile(cred.user, { displayName: name.trim() });
  await ensureUserDoc(cred.user.uid, name.trim(), null);
  // Email verification (BRD 4.1). The emulator accepts this without sending mail.
  sendEmailVerification(cred.user).catch(() => {});
  return cred.user;
}

export async function signInWithEmail(email: string, password: string) {
  return (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signInWithProvider(kind: 'google' | 'apple') {
  if (Platform.OS !== 'web') {
    throw new Error(
      `${kind === 'google' ? 'Google' : 'Apple'} sign-in on ${Platform.OS} needs the native SDK configured in a development build (see README). Use email for now.`,
    );
  }
  const provider = kind === 'google' ? new GoogleAuthProvider() : new OAuthProvider('apple.com');
  if (kind === 'apple') (provider as OAuthProvider).addScope('email');
  const cred = await signInWithPopup(auth, provider);
  await ensureUserDoc(cred.user.uid, cred.user.displayName ?? '', cred.user.photoURL);
  return cred.user;
}

export async function signOut() {
  await tracker.stop().catch(() => {});
  await liveShare.stopAll().catch(() => {});
  await backgroundLocation.clear().catch(() => {});
  await fbSignOut(auth);
}

export { USE_EMULATORS };
