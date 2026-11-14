import { describe, expect, it } from 'vitest';
import {
  activeDurationMs,
  coarsen,
  detectedCityDeparture,
  endJourney,
  formatDuration,
  haversineKm,
  nearestCity,
  pathDistanceKm,
  pauseJourney,
  resumeJourney,
  shouldRecord,
  type JourneyTiming,
} from '../../src/logic/journey';
import { computeAchievements, passportStats } from '../../src/logic/achievements';
import { planTrip } from '../../src/logic/planner';
import { CITY_BY_ID } from '../../src/data/cities';

describe('distance', () => {
  it('computes great-circle distances', () => {
    // Mumbai -> Goa is roughly 440 km as the crow flies
    const d = haversineKm(CITY_BY_ID.mumbai, CITY_BY_ID.goa);
    expect(d).toBeGreaterThan(400);
    expect(d).toBeLessThan(480);
    expect(pathDistanceKm([CITY_BY_ID.mumbai, CITY_BY_ID.goa, CITY_BY_ID.mumbai])).toBeCloseTo(2 * d, 6);
  });

  it('filters jitter, inaccurate fixes and impossible jumps', () => {
    const a = { lat: 15.5, lng: 73.8, accuracy: 10, timestamp: 0 };
    expect(shouldRecord(null, a)).toBe(true);
    expect(shouldRecord(a, { ...a, lat: 15.50005, timestamp: 1000 })).toBe(false); // ~5 m
    expect(shouldRecord(a, { ...a, lat: 15.51, timestamp: 60_000 })).toBe(true); // ~1.1 km in a minute
    expect(shouldRecord(a, { ...a, lat: 15.51, accuracy: 500, timestamp: 60_000 })).toBe(false);
    expect(shouldRecord(a, { ...a, lat: 28.6, timestamp: 60_000 })).toBe(false); // Goa->Delhi in 1 min
  });
});

describe('journey lifecycle (AC-002)', () => {
  const start: JourneyTiming = { status: 'active', startedAt: 0, pausedMs: 0 };

  it('excludes paused time from the duration', () => {
    const p = pauseJourney(start, 10_000);
    expect(activeDurationMs(p, 50_000)).toBe(10_000);
    const r = resumeJourney(p, 40_000);
    expect(r.pausedMs).toBe(30_000);
    expect(activeDurationMs(r, 60_000)).toBe(30_000);
    const e = endJourney(r, 70_000);
    expect(e.status).toBe('completed');
    expect(activeDurationMs(e, 999_999)).toBe(40_000);
  });

  it('can end directly from paused and rejects invalid transitions', () => {
    const e = endJourney(pauseJourney(start, 1000), 5000);
    expect(activeDurationMs(e)).toBe(1000);
    expect(() => resumeJourney(start)).toThrow();
    expect(() => pauseJourney(e)).toThrow();
    expect(() => endJourney(e)).toThrow();
  });

  it('formats durations', () => {
    expect(formatDuration(2 * 3600_000 + 14 * 60_000 + 36_000)).toBe('02:14:36');
  });
});

describe('location helpers', () => {
  it('resolves the nearest city only within range', () => {
    expect(nearestCity({ lat: 15.55, lng: 73.76 })?.id).toBe('goa');
    expect(nearestCity({ lat: 0, lng: -150 })).toBeNull();
  });

  it('requires several consecutive fixes outside the city to suggest ending', () => {
    const goa = CITY_BY_ID.goa;
    const inside = { lat: 15.5, lng: 73.8 };
    const outside = { lat: 19.0, lng: 72.8 };
    expect(detectedCityDeparture(goa, [inside, outside, outside])).toBe(false);
    expect(detectedCityDeparture(goa, [inside, outside, outside, outside])).toBe(true);
  });

  it('coarsens coordinates for public sharing', () => {
    expect(coarsen({ lat: 15.491234, lng: 73.827899 })).toEqual({ lat: 15.49, lng: 73.83 });
  });
});

describe('achievements', () => {
  const sat = new Date('2026-11-07T08:00:00').getTime(); // a Saturday
  it('unlocks badges from completed journeys', () => {
    const list = computeAchievements(
      [
        { status: 'completed', type: 'group', startedAt: sat, endedAt: sat + 86_400_000, countries: ['India'], cities: ['Goa'], continents: ['Asia'] },
        { status: 'completed', type: 'solo', startedAt: sat, endedAt: sat + 5 * 86_400_000, countries: ['United Arab Emirates'], cities: ['Dubai'], continents: ['Asia'] },
      ],
      'India',
    );
    const by = Object.fromEntries(list.map((a) => [a.id, a]));
    expect(by['first-journey'].unlocked).toBe(true);
    expect(by['first-international'].unlocked).toBe(true);
    expect(by['weekend-explorer'].unlocked).toBe(true);
    expect(by['crew-traveller'].unlocked).toBe(true);
    expect(by['ten-cities'].unlocked).toBe(false);
    expect(by['ten-cities'].progressLabel).toBe('2/10 cities');
  });

  it('does not count active journeys as completed', () => {
    const s = passportStats([{ status: 'active', type: 'solo', startedAt: 0, countries: ['India'], cities: ['Goa'] }]);
    expect(s.journeys).toBe(0);
    expect(computeAchievements([{ status: 'active', type: 'solo', startedAt: 0, countries: ['India'], cities: ['Goa'] }])[0].unlocked).toBe(false);
  });
});

describe('trip planner', () => {
  it('builds one entry per slot per day', () => {
    const plan = planTrip(CITY_BY_ID.goa, 3, 'food');
    expect(plan).toHaveLength(3);
    expect(plan.every((d) => d.items.length === 4)).toBe(true);
    expect(plan[0].items[0].kind).toBe('restaurant');
  });
});
