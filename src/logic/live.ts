/** Pure helpers for live location (unit tested in tests/unit/live.test.ts). */
import { haversineKm } from './journey';

export interface LivePoint {
  lat: number;
  lng: number;
  accuracy?: number | null;
  timestamp: number;
}

/** Crew live locations older than this are shown as stale/offline. */
export const LIVE_STALE_MS = 15 * 60_000;
/** Minimum spacing between Firestore writes while sharing (battery + cost). */
export const PUBLISH_MIN_INTERVAL_MS = 20_000;
export const PUBLISH_MIN_MOVE_M = 25;
/** Always refresh at least this often even when stationary, so others see "live". */
export const PUBLISH_HEARTBEAT_MS = 2 * 60_000;

/**
 * Decide whether a new fix should be published to the crew.
 * Throttles by time and distance, with a heartbeat while stationary.
 */
export function shouldPublish(last: LivePoint | null, next: LivePoint): boolean {
  if (next.accuracy != null && next.accuracy > 200) return false; // too imprecise to be useful
  if (!last) return true;
  const dt = next.timestamp - last.timestamp;
  if (dt >= PUBLISH_HEARTBEAT_MS) return true;
  if (dt < PUBLISH_MIN_INTERVAL_MS) return false;
  return haversineKm(last, next) * 1000 >= PUBLISH_MIN_MOVE_M;
}

export function isFresh(updatedAt: number | null | undefined, now = Date.now()): boolean {
  return !!updatedAt && now - updatedAt < LIVE_STALE_MS;
}

export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

export interface PlaceParts {
  name?: string | null; // POI or street
  district?: string | null; // locality / neighbourhood
  city?: string | null;
  region?: string | null;
  country?: string | null;
}

/** "Baga, Goa, India" – most specific useful parts, de-duplicated. */
export function placeLabel(p: PlaceParts, max = 3): string {
  const parts = [p.district ?? p.name, p.city, p.region, p.country]
    .map((x) => (x ?? '').trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const x of parts) if (!out.some((o) => o.toLowerCase() === x.toLowerCase())) out.push(x);
  return out.slice(0, max).join(', ');
}

/** Bounding box (with padding) for fitting a map camera to points. */
export function bounds(points: { lat: number; lng: number }[], padRatio = 0.15) {
  if (!points.length) return null;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
  }
  const dLat = Math.max(0.005, (maxLat - minLat) * (1 + padRatio * 2));
  const dLng = Math.max(0.005, (maxLng - minLng) * (1 + padRatio * 2));
  return { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2, latitudeDelta: dLat, longitudeDelta: dLng };
}
