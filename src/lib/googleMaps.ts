/// <reference types="google.maps" />
/**
 * Google Maps configuration shared by native (react-native-maps, PROVIDER_GOOGLE)
 * and web (Maps JavaScript API).
 *
 * Key: EXPO_PUBLIC_GOOGLE_MAPS_API_KEY (restrict it in Google Cloud console by
 * app package / bundle id / HTTP referrer). Without a key Google renders maps in
 * "for development purposes only" mode on web.
 */
export const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

/** Dark "night" style matching the ROAM navy theme. */
export const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0f1638' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8f9bd0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0f2c' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#2c3570' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#c4b5fd' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#7c88c4' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#12304a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1f2858' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#151c45' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3b3f8f' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#e0e7ff' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1b2150' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#06122e' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d6aa8' }] },
];

// ---------------- web loader ----------------

let loading: Promise<typeof google.maps> | null = null;

/**
 * Google rejected the key (not authorised for the Maps JavaScript API, wrong referrer,
 * billing…). Google calls window.gm_authFailure; maps then switch to the offline map
 * instead of showing Google's "Oops! Something went wrong" box.
 */
let authFailed = false;
const authListeners = new Set<() => void>();
export function googleMapsAuthFailed() {
  return authFailed;
}
export function onGoogleMapsAuthFailure(cb: () => void): () => void {
  authListeners.add(cb);
  return () => authListeners.delete(cb);
}
function installAuthFailureHook() {
  const w = window as unknown as { gm_authFailure?: () => void };
  w.gm_authFailure = () => {
    authFailed = true;
    console.warn('Google Maps rejected the API key — using the offline map. Allow the Maps JavaScript API for this key in Google Cloud.');
    authListeners.forEach((cb) => cb());
  };
}

/** Load the Maps JavaScript API once (web only). */
export function loadGoogleMapsWeb(timeoutMs = 15_000): Promise<typeof google.maps> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google Maps JS is web-only'));
  const w = window as unknown as { google?: typeof google; __roamGmapsInit?: () => void };
  if (authFailed) return Promise.reject(new Error('Google Maps key not authorised'));
  if (w.google?.maps?.Map) return Promise.resolve(w.google.maps);
  if (loading) return loading;
  installAuthFailureHook();
  loading = new Promise<typeof google.maps>((resolve, reject) => {
    const timer = setTimeout(() => {
      loading = null;
      reject(new Error('Google Maps took too long to load'));
    }, timeoutMs);
    w.__roamGmapsInit = () => {
      clearTimeout(timer);
      resolve(w.google!.maps);
    };
    const s = document.createElement('script');
    const key = GOOGLE_MAPS_API_KEY ? `key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&` : '';
    s.src = `https://maps.googleapis.com/maps/api/js?${key}v=weekly&callback=__roamGmapsInit`;
    s.async = true;
    s.onerror = () => {
      clearTimeout(timer);
      loading = null;
      reject(new Error('Google Maps could not be loaded'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export interface GeocodedPlace {
  name: string | null;
  district: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

/** Reverse geocode with Google's Geocoding service (web; requires an API key). */
export async function reverseGeocodeWeb(lat: number, lng: number): Promise<GeocodedPlace | null> {
  if (!GOOGLE_MAPS_API_KEY || authFailed) return null;
  const maps = await loadGoogleMapsWeb();
  // A rejected key leaves the geocoder hanging forever: give up on auth failure or after 8 s,
  // so callers fall back to the offline city catalogue.
  let off = () => {};
  const res = await Promise.race([
    new maps.Geocoder().geocode({ location: { lat, lng } }),
    new Promise<never>((_, rej) => {
      const t = setTimeout(() => rej(new Error('Geocoding timed out')), 8_000);
      off = onGoogleMapsAuthFailure(() => rej(new Error('Google Maps key not authorised')));
      const prevOff = off;
      off = () => {
        clearTimeout(t);
        prevOff();
      };
    }),
  ]).finally(() => off());
  const comps = res.results?.[0]?.address_components ?? [];
  const get = (t: string) => comps.find((c) => c.types.includes(t))?.long_name ?? null;
  return {
    name: get('point_of_interest') ?? get('premise') ?? get('route'),
    district: get('sublocality') ?? get('neighborhood') ?? get('locality'),
    city: get('locality') ?? get('administrative_area_level_2'),
    region: get('administrative_area_level_1'),
    country: get('country'),
  };
}
