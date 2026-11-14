import { describe, expect, it } from 'vitest';

import { EMPTY_BG_STATE, type BgPoint, type BgState } from '../../src/logic/background';
import { processBackgroundBatch, type BgDeps, type JourneyForWrite } from '../../src/services/backgroundProcessor';

const walk = (n: number, t0 = 1_000_000) =>
  Array.from({ length: n }, (_, i) => ({ lat: 15.5553 - i * 0.00135, lng: 73.7517, accuracy: 10, timestamp: t0 + i * 60_000 }));

function fakeDeps(init: Partial<BgState>, opts: { uid?: string | null; journey?: Partial<JourneyForWrite> | null; failWrites?: number; deniedGroups?: string[] } = {}) {
  let state: BgState = { ...EMPTY_BG_STATE, ...init };
  const writes: { points: BgPoint[]; km: number }[] = [];
  const published: string[] = [];
  let stopped = 0;
  let failWrites = opts.failWrites ?? 0;
  const deps: BgDeps = {
    loadState: async () => state,
    saveState: async (s) => {
      state = s;
    },
    currentUid: async () => (opts.uid === undefined ? 'u1' : opts.uid),
    getJourney: async (id) =>
      opts.journey === null ? null : { id, status: 'active', cityIds: [], route: [], anchorCityId: null, ...(opts.journey ?? {}) },
    saveBatch: async (_j, points, km) => {
      if (failWrites-- > 0) throw new Error('offline');
      writes.push({ points, km });
    },
    publishLive: async (g) => {
      if (opts.deniedGroups?.includes(g)) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
      published.push(g);
    },
    stopUpdates: async () => {
      stopped++;
    },
  };
  return { deps, writes, published, get state() { return state; }, get stopped() { return stopped; } };
}

const recording = { uid: 'u1', displayName: 'Dheeraj', journeyId: 'j1' };

describe('headless background batch', () => {
  it('writes filtered points for the active journey and keeps updates running', async () => {
    const f = fakeDeps(recording);
    const out = await processBackgroundBatch(walk(4), f.deps);
    expect(out).toMatchObject({ written: 4, stopped: false });
    expect(f.writes[0].km).toBeCloseTo(0.45, 1);
    expect(f.state.pending).toEqual([]);
    expect(f.state.lastFix?.timestamp).toBe(walk(4)[3].timestamp);
  });

  it('queues points while offline and uploads them with the next batch', async () => {
    const f = fakeDeps(recording, { failWrites: 1 });
    expect((await processBackgroundBatch(walk(3), f.deps)).queued).toBe(3);
    expect(f.state.pending).toHaveLength(3);
    const out = await processBackgroundBatch(walk(5).slice(3), f.deps);
    expect(out.written).toBe(5);
    expect(f.writes[0].km).toBeCloseTo(0.6, 1);
  });

  it('stops tracking when the user signed out or another account is signed in', async () => {
    for (const uid of [null, 'someone-else']) {
      const f = fakeDeps(recording, { uid });
      const out = await processBackgroundBatch(walk(2), f.deps);
      expect(out).toMatchObject({ stopped: true, reason: 'signed-out', written: 0 });
      expect(f.writes).toHaveLength(0);
      expect(f.state.journeyId).toBeNull();
    }
  });

  it('stops when the journey was ended or deleted elsewhere', async () => {
    const ended = fakeDeps(recording, { journey: { status: 'completed' } });
    expect(await processBackgroundBatch(walk(2), ended.deps)).toMatchObject({ stopped: true, reason: 'journey-ended' });
    const deleted = fakeDeps(recording, { journey: null });
    expect((await processBackgroundBatch(walk(2), deleted.deps)).stopped).toBe(true);
    expect(ended.writes).toHaveLength(0);
  });

  it('publishes to crews being shared with, and drops crews the user was removed from', async () => {
    const f = fakeDeps({ uid: 'u1', displayName: 'Priya', shareGroups: ['g1', 'g2'] }, { deniedGroups: ['g2'] });
    const out = await processBackgroundBatch(walk(1), f.deps);
    expect(out.published).toEqual(['g1']);
    expect(f.state.shareGroups).toEqual(['g1']);
    expect(out.stopped).toBe(false);
  });

  it('stops updates when nothing needs tracking', async () => {
    const f = fakeDeps({ uid: 'u1', displayName: 'P' });
    expect(await processBackgroundBatch(walk(1), f.deps)).toMatchObject({ stopped: true, reason: 'nothing-to-track' });
  });
});
