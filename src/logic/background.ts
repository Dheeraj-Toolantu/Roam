/**
 * Pure background-location batch processing (unit tested in tests/unit/background.test.ts).
 *
 * The OS delivers location fixes to the background task in batches (possibly
 * deferred, possibly out of order). This turns a batch + persisted state into:
 *  - the filtered journey points to store (jitter/speed/accuracy filtered)
 *  - the distance they add
 *  - at most one crew live-location update to publish (throttled)
 *  - the new persisted state (including a bounded retry queue for points that
 *    could not be uploaded, e.g. while offline)
 */
import { haversineKm, nearestCity, shouldRecord, type GeoPoint } from './journey';
import { shouldPublish, type LivePoint } from './live';

export interface BgPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: number;
  cityId: string | null;
}

export interface BgState {
  uid: string | null;
  displayName: string | null;
  /** Active journey being recorded (null = not recording a journey). */
  journeyId: string | null;
  /** Crew trips the user is sharing live location with. */
  shareGroups: string[];
  /** Last accepted journey fix (for distance + jitter filtering). */
  lastFix: GeoPoint | null;
  /** Last fix published to crews (for throttling). */
  lastPublished: LivePoint | null;
  /** Points accepted but not yet written to Firestore. */
  pending: BgPoint[];
  pendingKm: number;
}

export const EMPTY_BG_STATE: BgState = {
  uid: null,
  displayName: null,
  journeyId: null,
  shareGroups: [],
  lastFix: null,
  lastPublished: null,
  pending: [],
  pendingKm: 0,
};

/** Max points kept for retry (≈ a full day at 25 m spacing on the move). */
export const MAX_PENDING = 2000;

export interface RawFix {
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: number;
}

export interface BatchResult {
  state: BgState;
  /** Points to write now (includes previously pending ones). */
  toWrite: BgPoint[];
  addedKm: number;
  publish: LivePoint | null;
}

export function processBatch(prev: BgState, fixes: RawFix[]): BatchResult {
  const sorted = [...fixes].sort((a, b) => a.timestamp - b.timestamp);
  let lastFix = prev.lastFix;
  let km = 0;
  const accepted: BgPoint[] = [];

  if (prev.journeyId) {
    for (const f of sorted) {
      if (lastFix && f.timestamp <= lastFix.timestamp) continue; // already processed / stale
      const fix: GeoPoint = { lat: f.lat, lng: f.lng, accuracy: f.accuracy, timestamp: f.timestamp };
      if (!shouldRecord(lastFix, fix)) continue;
      if (lastFix) km += haversineKm(lastFix, fix);
      accepted.push({ ...f, cityId: nearestCity(f)?.id ?? null });
      lastFix = fix;
    }
  }

  let publish: LivePoint | null = null;
  let lastPublished = prev.lastPublished;
  const newest = sorted[sorted.length - 1];
  if (prev.shareGroups.length && newest) {
    const cand: LivePoint = { lat: newest.lat, lng: newest.lng, accuracy: newest.accuracy, timestamp: newest.timestamp };
    if (shouldPublish(lastPublished, cand)) {
      publish = cand;
      lastPublished = cand;
    }
  }

  const toWrite = [...prev.pending, ...accepted].slice(-MAX_PENDING);
  return {
    state: { ...prev, lastFix, lastPublished, pending: toWrite, pendingKm: prev.pendingKm + km },
    toWrite,
    addedKm: prev.pendingKm + km,
    publish,
  };
}

/** State after `toWrite`/`addedKm` were successfully stored. */
export function markWritten(s: BgState): BgState {
  return { ...s, pending: [], pendingKm: 0 };
}

/** Background updates are needed while recording a journey or sharing with a crew. */
export function needsBackgroundUpdates(s: Pick<BgState, 'journeyId' | 'shareGroups'>): boolean {
  return !!s.journeyId || s.shareGroups.length > 0;
}
