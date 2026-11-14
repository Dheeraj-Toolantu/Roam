import { CITIES, type City } from '../data/cities';

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy?: number | null;
  timestamp: number;
}

const R = 6371; // km

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Points with worse accuracy than this (metres) are ignored for distance. */
export const MAX_ACCURACY_M = 100;
/** Implausible speed for ground/air travel between consecutive fixes (km/h). */
export const MAX_SPEED_KMH = 1000;

/**
 * Decide whether a new GPS fix should be recorded, filtering jitter and
 * inaccurate fixes. Battery-aware sampling relies on the OS distance filter;
 * this is a second line of defence for noisy fixes.
 */
export function shouldRecord(prev: GeoPoint | null, next: GeoPoint, minMoveM = 20): boolean {
  if (next.accuracy != null && next.accuracy > MAX_ACCURACY_M) return false;
  if (!prev) return true;
  const km = haversineKm(prev, next);
  const noiseKm = Math.max(minMoveM, next.accuracy ?? 0) / 1000;
  if (km < noiseKm) return false;
  const hours = (next.timestamp - prev.timestamp) / 3_600_000;
  if (hours > 0 && km / hours > MAX_SPEED_KMH) return false;
  return true;
}

/** Total path distance for an ordered list of points (already filtered). */
export function pathDistanceKm(points: { lat: number; lng: number }[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversineKm(points[i - 1], points[i]);
  return d;
}

export type JourneyStatus = 'active' | 'paused' | 'completed';

export interface JourneyTiming {
  status: JourneyStatus;
  startedAt: number;
  endedAt?: number | null;
  /** total ms spent paused before the current segment */
  pausedMs: number;
  /** when the journey was last paused (only while status === 'paused') */
  pausedAt?: number | null;
}

/** Active (non-paused) journey duration in ms. */
export function activeDurationMs(j: JourneyTiming, now = Date.now()): number {
  const end = j.status === 'completed' ? (j.endedAt ?? now) : j.status === 'paused' ? (j.pausedAt ?? now) : now;
  return Math.max(0, end - j.startedAt - (j.pausedMs || 0));
}

export function pauseJourney(j: JourneyTiming, now = Date.now()): JourneyTiming {
  if (j.status !== 'active') throw new Error('Only an active journey can be paused');
  return { ...j, status: 'paused', pausedAt: now };
}

export function resumeJourney(j: JourneyTiming, now = Date.now()): JourneyTiming {
  if (j.status !== 'paused') throw new Error('Only a paused journey can be resumed');
  return { ...j, status: 'active', pausedMs: j.pausedMs + (now - (j.pausedAt ?? now)), pausedAt: null };
}

export function endJourney(j: JourneyTiming, now = Date.now()): JourneyTiming {
  if (j.status === 'completed') throw new Error('Journey already ended');
  const resumed = j.status === 'paused' ? resumeJourney(j, now) : j;
  return { ...resumed, status: 'completed', endedAt: now };
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function formatDurationShort(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h ${mins % 60}m`;
  return `${Math.round(h / 24)} days`;
}

export function formatKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString('en-IN')} km`;
}

/** City-level reverse geocoding against the curated catalogue (works offline). */
export function nearestCity(p: { lat: number; lng: number }, maxKm = 80): City | null {
  let best: City | null = null;
  let bestKm = Infinity;
  for (const c of CITIES) {
    const d = haversineKm(p, c);
    if (d < bestKm) {
      bestKm = d;
      best = c;
    }
  }
  return bestKm <= maxKm ? best : null;
}

/**
 * Detect that the traveller has left the city the journey is anchored to.
 * Requires the last `confirmations` fixes to all be outside `radiusKm` to avoid
 * suggesting an end because of a single bad fix (BRD 5.2: "with user confirmation").
 */
export function detectedCityDeparture(
  cityCenter: { lat: number; lng: number } | null,
  recent: { lat: number; lng: number }[],
  radiusKm = 60,
  confirmations = 3,
): boolean {
  if (!cityCenter || recent.length < confirmations) return false;
  return recent.slice(-confirmations).every((p) => haversineKm(cityCenter, p) > radiusKm);
}

/** Round a coordinate to ~1km so it can be shared without revealing precise location (BR-014). */
export function coarsen(p: { lat: number; lng: number }, decimals = 2) {
  const f = 10 ** decimals;
  return { lat: Math.round(p.lat * f) / f, lng: Math.round(p.lng * f) / f };
}
