import * as Location from 'expo-location';

import { CITY_BY_ID } from '../data/cities';
import { detectedCityDeparture, haversineKm, nearestCity, shouldRecord, type GeoPoint } from '../logic/journey';
import type { Journey } from '../types';
import { backgroundLocation, onBackgroundFixes } from './backgroundLocation';
import { saveLocationBatch, setPresence, type LocationPoint } from './journeys';
import { liveLocation } from './location';

/**
 * Journey tracker.
 *
 * Two modes:
 *  - 'background' (iOS/Android with "Allow all the time"): the OS delivers fixes to
 *    the background task (services/backgroundLocation.ts), which stores them even when
 *    the app is in the background or closed. The tracker only mirrors fixes for the UI.
 *  - 'foreground' (web, or background permission not granted): a watchPosition
 *    subscription records while the app is open (logic below).
 *
 * - Battery aware: balanced accuracy + OS distance filter (adaptive sampling, BRD §16.6)
 * - Jitter filtering via shouldRecord()
 * - Points are buffered and written in batches; Firestore queues writes while offline
 * - Detects city departure and suggests ending the journey (user confirms)
 *
 */

type Listener = (s: TrackerState) => void;

export interface TrackerState {
  journeyId: string | null;
  permission: 'unknown' | 'granted' | 'denied';
  running: boolean;
  lastFix: GeoPoint | null;
  currentCityId: string | null;
  pendingKm: number;
  suggestEnd: boolean;
  error: string | null;
  /** How the journey is being recorded. */
  mode: 'background' | 'foreground' | null;
}

const FLUSH_EVERY_POINTS = 5;
const FLUSH_EVERY_MS = 30_000;

class JourneyTracker {
  private state: TrackerState = {
    journeyId: null, permission: 'unknown', running: false, lastFix: null,
    currentCityId: null, pendingKm: 0, suggestEnd: false, error: null, mode: null,
  };
  private listeners = new Set<Listener>();
  private sub: Location.LocationSubscription | null = null;
  private buffer: LocationPoint[] = [];
  private bufferKm = 0;
  private recent: { lat: number; lng: number }[] = [];
  private journey: Journey | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private presence: { uid: string; name: string; enabled: boolean } | null = null;
  private bgUnsub: (() => void) | null = null;

  get snapshot() {
    return this.state;
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    l(this.state);
    return () => {
      this.listeners.delete(l);
    };
  }

  private set(patch: Partial<TrackerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  async requestPermission(): Promise<boolean> {
    try {
      const granted = await liveLocation.ensurePermission();
      this.set({ permission: granted ? 'granted' : 'denied' });
      return granted;
    } catch (e) {
      this.set({ permission: 'denied', error: (e as Error).message });
      return false;
    }
  }

  /** Keep the tracker's view of the journey document fresh (stats, cities). */
  updateJourney(j: Journey | null) {
    this.journey = j;
  }

  async start(j: Journey, presence?: { uid: string; name: string; enabled: boolean }) {
    if (this.state.running && this.state.journeyId === j.id) return;
    await this.stop();
    this.journey = j;
    this.presence = presence ?? null;
    this.set({ journeyId: j.id, error: null, suggestEnd: false });
    const ok = this.state.permission === 'granted' || (await this.requestPermission());
    if (!ok) {
      this.set({ error: 'Location permission denied. ROAM can still record photos and activities.' });
      return;
    }
    // Prefer OS background updates (keeps recording when the app is backgrounded/closed).
    if (await backgroundLocation.setJourney(j.ownerId, j.ownerName, j.id).catch(() => false)) {
      this.bgUnsub = onBackgroundFixes((fixes) => fixes.forEach((f) => this.observe(f)));
      this.set({ running: true, mode: 'background' });
      return;
    }
    try {
      this.sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 15_000 },
        (loc) => this.onFix({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          accuracy: loc.coords.accuracy ?? null,
          timestamp: loc.timestamp,
        }),
      );
      this.flushTimer = setInterval(() => void this.flush(), FLUSH_EVERY_MS);
      this.set({ running: true, mode: 'foreground' });
    } catch (e) {
      this.set({ error: `Could not start location tracking: ${(e as Error).message}` });
    }
  }

  /** Exposed so tests and the web simulator can feed fixes. */
  onFix(fix: GeoPoint) {
    // Every fix also updates the app-wide live location (map dot, place name, crew sharing).
    liveLocation.ingest({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy ?? null, timestamp: fix.timestamp });
    if (!this.journey || this.journey.status !== 'active') return;
    const prev = this.state.lastFix;
    if (!shouldRecord(prev, fix)) return;
    const km = prev ? haversineKm(prev, fix) : 0;
    const city = nearestCity(fix);
    this.buffer.push({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy ?? null, timestamp: fix.timestamp, cityId: city?.id ?? null });
    this.bufferKm += km;
    this.recent = [...this.recent.slice(-9), { lat: fix.lat, lng: fix.lng }];
    const anchor = this.journey.anchorCityId ? CITY_BY_ID[this.journey.anchorCityId] : null;
    const suggestEnd = detectedCityDeparture(anchor ?? null, this.recent);
    const cityChanged = (city?.id ?? null) !== this.state.currentCityId;
    this.set({ lastFix: fix, currentCityId: city?.id ?? this.state.currentCityId, pendingKm: this.bufferKm, suggestEnd });
    if (cityChanged && this.presence) {
      void setPresence(this.presence.uid, this.presence.name, city?.id ?? null, this.presence.enabled).catch(() => {});
    }
    if (this.buffer.length >= FLUSH_EVERY_POINTS || cityChanged) void this.flush();
  }

  /**
   * Background mode: mirror a fix for the UI only (stored by the background task).
   * Updates the live dot, current city, Live World presence and the "left the city" prompt.
   */
  observe(fix: GeoPoint) {
    liveLocation.ingest({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy ?? null, timestamp: fix.timestamp });
    if (!this.journey || this.journey.status !== 'active') return;
    if (this.state.lastFix && fix.timestamp <= this.state.lastFix.timestamp) return;
    const city = nearestCity(fix);
    this.recent = [...this.recent.slice(-9), { lat: fix.lat, lng: fix.lng }];
    const anchor = this.journey.anchorCityId ? CITY_BY_ID[this.journey.anchorCityId] : null;
    const cityChanged = (city?.id ?? null) !== this.state.currentCityId;
    this.set({ lastFix: fix, currentCityId: city?.id ?? this.state.currentCityId, suggestEnd: detectedCityDeparture(anchor ?? null, this.recent) });
    if (cityChanged && this.presence) {
      void setPresence(this.presence.uid, this.presence.name, city?.id ?? null, this.presence.enabled).catch(() => {});
    }
  }

  async flush() {
    if (!this.journey || !this.buffer.length) return;
    const points = this.buffer;
    const km = this.bufferKm;
    this.buffer = [];
    this.bufferKm = 0;
    try {
      await saveLocationBatch(this.journey, points, km);
      this.set({ pendingKm: 0 });
    } catch (e) {
      // put them back and retry on next flush
      this.buffer = [...points, ...this.buffer];
      this.bufferKm += km;
      this.set({ error: `Sync delayed: ${(e as Error).message}` });
    }
  }

  dismissEndSuggestion() {
    this.recent = [];
    this.set({ suggestEnd: false });
  }

  async stop() {
    if (this.state.mode === 'background' && this.journey) {
      // Upload anything queued, then stop recording this journey in the background.
      await backgroundLocation.flush();
      await backgroundLocation.setJourney(this.journey.ownerId, this.journey.ownerName, null).catch(() => {});
    }
    this.bgUnsub?.();
    this.bgUnsub = null;
    this.sub?.remove();
    this.sub = null;
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    await this.flush();
    if (this.presence) await setPresence(this.presence.uid, this.presence.name, null, false).catch(() => {});
    this.set({ running: false, mode: null });
  }

  async getCurrentPosition(): Promise<GeoPoint | null> {
    if (this.state.lastFix) return this.state.lastFix;
    try {
      if (this.state.permission !== 'granted' && !(await this.requestPermission())) return null;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy, timestamp: loc.timestamp };
    } catch {
      return null;
    }
  }
}

export const tracker = new JourneyTracker();
