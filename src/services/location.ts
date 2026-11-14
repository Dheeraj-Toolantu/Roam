import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { CITIES, type City } from '../data/cities';
import { reverseGeocodeWeb } from '../lib/googleMaps';
import { haversineKm, nearestCity } from '../logic/journey';
import { placeLabel, type LivePoint } from '../logic/live';

/**
 * Live location store (BRD §5 – location services).
 *
 *  - detect(): asks for permission (if not yet decided) and gets the current position
 *  - acquireLive()/release(): reference-counted live watcher used by map screens,
 *    crew live sharing and anything else that needs continuous updates
 *  - ingest(): the journey tracker feeds its fixes in, so there is one source of truth
 *  - reverse geocoding: platform geocoder on iOS/Android, Google Geocoder on web
 *    (with an API key), falling back to the offline city catalogue
 */

export interface PlaceInfo {
  label: string; // "Baga, Goa, India"
  city: string | null;
  country: string | null;
  cityId: string | null; // matched catalogue city (for Explore, passport, journeys)
}

export interface LiveLocationState {
  permission: 'unknown' | 'granted' | 'denied';
  fix: (LivePoint & { heading?: number | null; speed?: number | null }) | null;
  place: PlaceInfo | null;
  live: boolean; // a continuous watcher is running
  detecting: boolean;
  error: string | null;
}

type Listener = (s: LiveLocationState) => void;

class LiveLocation {
  private state: LiveLocationState = { permission: 'unknown', fix: null, place: null, live: false, detecting: false, error: null };
  private listeners = new Set<Listener>();
  private sub: Location.LocationSubscription | null = null;
  private refs = 0;
  private geocodedAt: LivePoint | null = null;
  private geocoding = false;

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

  private set(p: Partial<LiveLocationState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l(this.state));
  }

  async ensurePermission(): Promise<boolean> {
    if (this.state.permission === 'granted') return true;
    try {
      const current = await Location.getForegroundPermissionsAsync();
      const res = current.granted || !current.canAskAgain ? current : await Location.requestForegroundPermissionsAsync();
      const granted = res.status === 'granted';
      this.set({ permission: granted ? 'granted' : 'denied', error: granted ? null : 'Location permission is off. Enable it to see where you are.' });
      return granted;
    } catch (e) {
      this.set({ permission: 'denied', error: (e as Error).message });
      return false;
    }
  }

  /** Detect the current location once (used automatically after sign-in). */
  async detect(): Promise<LiveLocationState['fix']> {
    if (this.state.detecting) return this.state.fix;
    this.set({ detecting: true });
    try {
      if (!(await this.ensurePermission())) return null;
      const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(() => null);
      if (last) this.ingestLocation(last);
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      this.ingestLocation(loc);
      return this.state.fix;
    } catch (e) {
      this.set({ error: `Couldn't detect your location: ${(e as Error).message}` });
      return null;
    } finally {
      this.set({ detecting: false });
    }
  }

  /** Start (or join) continuous live updates. Call the returned function to release. */
  acquireLive(): () => void {
    this.refs++;
    if (this.refs === 1) void this.startWatch();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.refs = Math.max(0, this.refs - 1);
      if (this.refs === 0) this.stopWatch();
    };
  }

  private async startWatch() {
    if (!(await this.ensurePermission()) || this.refs === 0 || this.sub) return;
    try {
      this.sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5_000 },
        (loc) => this.ingestLocation(loc),
      );
      if (this.refs === 0) this.stopWatch();
      else this.set({ live: true });
    } catch (e) {
      this.set({ error: `Live location unavailable: ${(e as Error).message}` });
    }
  }

  private stopWatch() {
    this.sub?.remove();
    this.sub = null;
    this.set({ live: false });
  }

  private ingestLocation(loc: Location.LocationObject) {
    this.ingest({
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
      timestamp: loc.timestamp,
      heading: loc.coords.heading,
      speed: loc.coords.speed,
    });
  }

  /** Accept a fix from any source (watcher, one-off detection, journey tracker). */
  ingest(fix: NonNullable<LiveLocationState['fix']>) {
    if (this.state.fix && fix.timestamp < this.state.fix.timestamp) return;
    this.set({ fix, permission: 'granted', error: null });
    // Re-geocode only when moved >300 m (geocoding is rate-limited / costs quota)
    if (!this.geocodedAt || haversineKm(this.geocodedAt, fix) > 0.3) void this.geocode(fix);
  }

  private async geocode(p: LivePoint) {
    if (this.geocoding) return;
    this.geocoding = true;
    this.geocodedAt = p;
    const catalogue = nearestCity(p, 120);
    try {
      let parts: { name?: string | null; district?: string | null; city?: string | null; region?: string | null; country?: string | null } | null = null;
      if (Platform.OS === 'web') {
        parts = await reverseGeocodeWeb(p.lat, p.lng).catch(() => null);
      } else {
        const [r] = await Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng }).catch(() => []);
        if (r) parts = { name: r.name, district: r.district ?? r.subregion, city: r.city, region: r.region, country: r.country };
      }
      const city = parts?.city ?? catalogue?.name ?? null;
      const country = parts?.country ?? catalogue?.country ?? null;
      const matched = catalogue ?? matchCity(city);
      this.set({
        place: {
          label: placeLabel(parts ?? { city, country }) || 'Unknown place',
          city,
          country,
          cityId: matched?.id ?? null,
        },
      });
    } finally {
      this.geocoding = false;
    }
  }
}

function matchCity(name: string | null): City | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase();
  return CITIES.find((c) => c.name.toLowerCase() === n || n.includes(c.name.toLowerCase()));
}

export const liveLocation = new LiveLocation();

/**
 * React hook. `live: true` keeps a continuous watcher running while the
 * component is mounted; otherwise the component just reads the last known state.
 */
export function useLiveLocation(opts: { live?: boolean; detect?: boolean } = {}) {
  const [s, setS] = useState(liveLocation.snapshot);
  useEffect(() => liveLocation.subscribe(setS), []);
  useEffect(() => {
    if (opts.detect && !liveLocation.snapshot.fix) void liveLocation.detect();
  }, [opts.detect]);
  useEffect(() => (opts.live ? liveLocation.acquireLive() : undefined), [opts.live]);
  return s;
}

/** Catalogue destinations sorted by distance from a point (Explore "Near you"). */
export function nearbyCities(p: { lat: number; lng: number }, n = 5) {
  return CITIES.map((c) => ({ city: c, km: haversineKm(p, c) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}
