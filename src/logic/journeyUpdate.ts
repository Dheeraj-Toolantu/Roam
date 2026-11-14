import { CITIES } from '../data/cities';

export interface PointForUpdate {
  lat: number;
  lng: number;
  timestamp: number;
  cityId: string | null;
}

/**
 * Journey-document fields derived from a batch of new GPS points (everything
 * except the distance increment). Shared by the in-app tracker and the
 * background task so both update journeys identically.
 */
export function locationBatchUpdate(
  j: { cityIds: string[]; route: { lat: number; lng: number }[] | null | undefined; anchorCityId: string | null },
  points: PointForUpdate[],
) {
  const newCityIds = Array.from(new Set(points.map((p) => p.cityId).filter((x): x is string => !!x))).filter((c) => !j.cityIds.includes(c));
  const cityIds = [...j.cityIds, ...newCityIds];
  const cities = cityIds.map((id) => CITIES.find((c) => c.id === id)).filter((c): c is (typeof CITIES)[number] => !!c);
  const last = points[points.length - 1];
  // Keep a downsampled route on the journey doc (max ~300 points) for fast map rendering.
  let route = [...(j.route ?? []), ...points.map((p) => ({ lat: p.lat, lng: p.lng }))];
  if (route.length > 300) route = route.filter((_, i) => i % 2 === 0 || i === route.length - 1);
  return {
    lastPoint: { lat: last.lat, lng: last.lng, timestamp: last.timestamp },
    cityIds,
    cities: cities.map((c) => c.name),
    countries: Array.from(new Set(cities.map((c) => c.country))),
    continents: Array.from(new Set(cities.map((c) => c.continent))),
    anchorCityId: j.anchorCityId ?? cityIds[0] ?? null,
    route,
  };
}
