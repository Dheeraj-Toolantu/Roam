import { describe, expect, it } from 'vitest';

import { EMPTY_BG_STATE, markWritten, MAX_PENDING, needsBackgroundUpdates, processBatch, type BgState } from '../../src/logic/background';

const recording: BgState = { ...EMPTY_BG_STATE, uid: 'u1', journeyId: 'j1' };
// ~150 m steps south from Baga, 60 s apart (≈9 km/h)
const walk = (n: number, t0 = 1_000_000) =>
  Array.from({ length: n }, (_, i) => ({ lat: 15.5553 - i * 0.00135, lng: 73.7517, accuracy: 10, timestamp: t0 + i * 60_000 }));

describe('background batch processing', () => {
  it('records filtered points with distance and city', () => {
    const r = processBatch(recording, walk(5));
    expect(r.toWrite).toHaveLength(5);
    expect(r.toWrite[0].cityId).toBe('goa');
    expect(r.addedKm).toBeCloseTo(4 * 0.15, 1);
    expect(r.state.lastFix?.timestamp).toBe(walk(5)[4].timestamp);
  });

  it('handles out-of-order and already-processed (re-delivered) fixes', () => {
    const first = processBatch(recording, walk(3));
    const stored = markWritten(first.state);
    const again = processBatch(stored, [...walk(5)].reverse()); // includes the 3 old ones, reversed
    expect(again.toWrite).toHaveLength(2);
    expect(again.addedKm).toBeCloseTo(2 * 0.15, 1);
  });

  it('drops jitter, inaccurate and impossible fixes', () => {
    const t = 1_000_000;
    const r = processBatch(recording, [
      { lat: 15.5553, lng: 73.7517, accuracy: 10, timestamp: t },
      { lat: 15.55531, lng: 73.7517, accuracy: 10, timestamp: t + 60_000 }, // 1 m jitter
      { lat: 15.5, lng: 73.7517, accuracy: 900, timestamp: t + 120_000 }, // inaccurate
      { lat: 28.6, lng: 77.2, accuracy: 10, timestamp: t + 180_000 }, // Goa→Delhi in 3 min
    ]);
    expect(r.toWrite).toHaveLength(1);
    expect(r.addedKm).toBe(0);
  });

  it('keeps unsent points queued until written, bounded', () => {
    const r1 = processBatch(recording, walk(3));
    // upload failed: state keeps pending
    const r2 = processBatch(r1.state, walk(6).slice(3));
    expect(r2.toWrite).toHaveLength(6);
    expect(r2.addedKm).toBeCloseTo(5 * 0.15, 1);
    expect(markWritten(r2.state).pending).toEqual([]);
    const huge: BgState = { ...recording, pending: Array.from({ length: MAX_PENDING + 50 }, (_, i) => ({ lat: 1, lng: 1, accuracy: 5, timestamp: i, cityId: null })) };
    expect(processBatch(huge, []).toWrite).toHaveLength(MAX_PENDING);
  });

  it('records nothing when no journey is active, but still publishes to crews (throttled)', () => {
    const sharing: BgState = { ...EMPTY_BG_STATE, uid: 'u1', shareGroups: ['g1'] };
    const r1 = processBatch(sharing, walk(2));
    expect(r1.toWrite).toEqual([]);
    expect(r1.publish?.timestamp).toBe(walk(2)[1].timestamp);
    // 10 s later, barely moved → throttled
    const r2 = processBatch(r1.state, [{ lat: walk(2)[1].lat, lng: 73.7517, accuracy: 10, timestamp: walk(2)[1].timestamp + 10_000 }]);
    expect(r2.publish).toBeNull();
  });

  it('knows when background updates are required', () => {
    expect(needsBackgroundUpdates(EMPTY_BG_STATE)).toBe(false);
    expect(needsBackgroundUpdates({ journeyId: 'j', shareGroups: [] })).toBe(true);
    expect(needsBackgroundUpdates({ journeyId: null, shareGroups: ['g'] })).toBe(true);
  });
});
