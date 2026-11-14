import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '../lib/firebase';
import { shouldPublish, type LivePoint } from '../logic/live';
import type { Group, UserProfile } from '../types';
import { backgroundLocation } from './backgroundLocation';
import { liveLocation } from './location';
import { notifyMany } from './notifications';

/**
 * Opt-in live location sharing with a crew (BRD 11.5, BR-006).
 * Nothing is shared unless the member explicitly turns it on for that trip.
 * While on, the device keeps a live watcher and publishes throttled updates to
 * groups/{gid}/live/{uid}; turning it off deletes the document.
 */

export interface CrewLiveLocation {
  uid: string;
  name: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  updatedAt: number;
}

type Me = Pick<UserProfile, 'uid' | 'displayName'>;
const storeKey = (uid: string) => `roam.liveShare.${uid}`;

class LiveShare {
  private groups = new Set<string>();
  private me: Me | null = null;
  private release: (() => void) | null = null;
  private unsub: (() => void) | null = null;
  private last: LivePoint | null = null;
  private listeners = new Set<() => void>();

  isSharing(groupId: string) {
    return this.groups.has(groupId);
  }

  onChange(l: () => void) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  /** Restore sharing after an app restart (called once the user is signed in). */
  async init(me: Me) {
    if (this.me?.uid === me.uid) return;
    await this.stopAll(false);
    this.me = me;
    const saved = await AsyncStorage.getItem(storeKey(me.uid)).catch(() => null);
    const ids: string[] = saved ? JSON.parse(saved) : [];
    ids.forEach((g) => this.groups.add(g));
    if (this.groups.size) await this.start();
    this.emit();
  }

  async enable(group: Pick<Group, 'id' | 'name' | 'memberIds'>, me: Me) {
    this.me = me;
    const fix = liveLocation.snapshot.fix ?? (await liveLocation.detect());
    if (!fix) throw new Error('Allow location access to share your live location.');
    this.groups.add(group.id);
    await this.persist();
    await this.write(group.id, fix);
    await this.start();
    this.emit();
    await notifyMany(group.memberIds, { uid: me.uid, displayName: me.displayName }, 'groupActivity', `${me.displayName} is sharing live location in ${group.name}`, `/trip/${group.id}`);
  }

  async disable(groupId: string) {
    this.groups.delete(groupId);
    await this.persist();
    if (this.me) await deleteDoc(doc(db, 'groups', groupId, 'live', this.me.uid)).catch(() => {});
    if (!this.groups.size) this.stop();
    else await this.start(); // update the set of trips the background task publishes to
    this.emit();
  }

  /** Stop everything (sign-out). */
  async stopAll(deleteDocs = true) {
    if (deleteDocs && this.me) {
      await Promise.all([...this.groups].map((g) => deleteDoc(doc(db, 'groups', g, 'live', this.me!.uid)).catch(() => {})));
    }
    this.groups.clear();
    this.stop();
    this.me = null;
    this.emit();
  }

  /**
   * Keep publishing while any trip is shared. On iOS/Android with background
   * permission the OS background task publishes (works with the app closed);
   * otherwise a foreground watcher publishes while the app is open.
   */
  private async start() {
    const me = this.me;
    if (!me) return;
    if (await backgroundLocation.setShareGroups(me.uid, me.displayName, [...this.groups]).catch(() => false)) {
      this.stopForeground();
      return;
    }
    if (this.release) return;
    this.release = liveLocation.acquireLive();
    this.unsub = liveLocation.subscribe((s) => {
      if (!s.fix || !shouldPublish(this.last, s.fix)) return;
      const fix = s.fix;
      void Promise.all([...this.groups].map((g) => this.write(g, fix)));
    });
  }

  private stop() {
    this.stopForeground();
    if (this.me) void backgroundLocation.setShareGroups(this.me.uid, this.me.displayName, []).catch(() => {});
  }

  private stopForeground() {
    this.unsub?.();
    this.unsub = null;
    this.release?.();
    this.release = null;
    this.last = null;
  }

  private async write(groupId: string, fix: LivePoint) {
    if (!this.me) return;
    this.last = fix;
    const data: CrewLiveLocation = {
      uid: this.me.uid,
      name: this.me.displayName,
      lat: fix.lat,
      lng: fix.lng,
      accuracy: fix.accuracy ?? null,
      updatedAt: Date.now(),
    };
    try {
      await setDoc(doc(db, 'groups', groupId, 'live', this.me.uid), data);
    } catch (e) {
      // Removed from the group or offline: stop sharing to that group
      if ((e as { code?: string }).code === 'permission-denied') await this.disable(groupId);
    }
  }

  private async persist() {
    if (!this.me) return;
    await AsyncStorage.setItem(storeKey(this.me.uid), JSON.stringify([...this.groups])).catch(() => {});
  }
}

export const liveShare = new LiveShare();

export function subscribeCrewLive(groupId: string, cb: (l: CrewLiveLocation[]) => void) {
  return onSnapshot(
    collection(db, 'groups', groupId, 'live'),
    (s) => cb(s.docs.map((d) => d.data() as CrewLiveLocation)),
    () => cb([]),
  );
}

export function useIsSharing(groupId: string) {
  const [on, setOn] = useState(liveShare.isSharing(groupId));
  useEffect(() => {
    setOn(liveShare.isSharing(groupId));
    return liveShare.onChange(() => setOn(liveShare.isSharing(groupId)));
  }, [groupId]);
  return on;
}
