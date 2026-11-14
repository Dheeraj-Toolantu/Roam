import { describe, expect, it } from 'vitest';

import { ago, bounds, isFresh, LIVE_STALE_MS, placeLabel, PUBLISH_HEARTBEAT_MS, shouldPublish } from '../../src/logic/live';

const base = { lat: 15.5553, lng: 73.7517, accuracy: 10, timestamp: 1_000_000 };

describe('crew live-location publishing throttle', () => {
  it('publishes the first fix', () => {
    expect(shouldPublish(null, base)).toBe(true);
  });

  it('does not publish more often than every 20 s', () => {
    expect(shouldPublish(base, { ...base, lat: base.lat + 0.01, timestamp: base.timestamp + 5_000 })).toBe(false);
  });

  it('publishes after 20 s when the user moved at least 25 m', () => {
    expect(shouldPublish(base, { ...base, lat: base.lat + 0.0005, timestamp: base.timestamp + 21_000 })).toBe(true); // ~55 m
    expect(shouldPublish(base, { ...base, lat: base.lat + 0.0001, timestamp: base.timestamp + 21_000 })).toBe(false); // ~11 m
  });

  it('sends a heartbeat while stationary so others still see the user as live', () => {
    expect(shouldPublish(base, { ...base, timestamp: base.timestamp + PUBLISH_HEARTBEAT_MS })).toBe(true);
  });

  it('ignores very inaccurate fixes', () => {
    expect(shouldPublish(null, { ...base, accuracy: 500 })).toBe(false);
  });
});

describe('freshness & labels', () => {
  it('marks locations stale after 15 minutes', () => {
    const now = 10_000_000;
    expect(isFresh(now - 60_000, now)).toBe(true);
    expect(isFresh(now - LIVE_STALE_MS - 1, now)).toBe(false);
    expect(isFresh(null, now)).toBe(false);
    expect(ago(now - 10_000, now)).toBe('just now');
    expect(ago(now - 5 * 60_000, now)).toBe('5 min ago');
  });

  it('builds short, de-duplicated place labels', () => {
    expect(placeLabel({ district: 'Baga', city: 'Goa', region: 'Goa', country: 'India' })).toBe('Baga, Goa, India');
    expect(placeLabel({ city: 'Goa', country: 'India' })).toBe('Goa, India');
    expect(placeLabel({ name: 'Fort Aguada', city: 'Candolim', region: 'Goa', country: 'India' })).toBe('Fort Aguada, Candolim, Goa');
    expect(placeLabel({})).toBe('');
  });

  it('computes padded camera bounds', () => {
    const b = bounds([{ lat: 15.5, lng: 73.8 }, { lat: 15.6, lng: 73.9 }])!;
    expect(b.latitude).toBeCloseTo(15.55);
    expect(b.longitude).toBeCloseTo(73.85);
    expect(b.latitudeDelta).toBeGreaterThan(0.1);
    expect(bounds([])).toBeNull();
    expect(bounds([{ lat: 1, lng: 1 }])!.latitudeDelta).toBe(0.005);
  });
});
