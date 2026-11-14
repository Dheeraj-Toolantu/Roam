import { describe, expect, it } from 'vitest';

import { buildScore, midiToHz, TRACKS } from '../../src/logic/musicScore';
import { buildStoryTimeline, pickMemories, shotAt, storyFileName, TEMPLATE_SPECS, type StoryMemory } from '../../src/logic/storyTimeline';

const mem = (n: number, videoEvery = 0): StoryMemory[] =>
  Array.from({ length: n }, (_, i) => ({ url: `u${i}`, isVideo: videoEvery > 0 && i % videoEvery === 0, place: `P${i}`, time: 1000 + i * 60_000 }));

describe('story timeline', () => {
  it.each(['reel', 'cinematic'] as const)('%s fills exactly the template length', (tpl) => {
    for (const n of [0, 1, 3, 8, 40]) {
      const { shots, duration } = buildStoryTimeline(mem(n, 3), tpl);
      expect(duration).toBeCloseTo(TEMPLATE_SPECS[tpl].total, 2);
      // contiguous, in order
      shots.forEach((s, i) => i && expect(s.start).toBeCloseTo(shots[i - 1].start + shots[i - 1].duration, 6));
      expect(shots[0].kind).toBe('intro');
      expect(shots[shots.length - 1].kind).toBe('outro');
    }
  });

  it('reel is ≤30 s for WhatsApp Status and caps the number of memories', () => {
    const { shots } = buildStoryTimeline(mem(40), 'reel');
    const memories = shots.filter((s) => s.kind === 'memory');
    expect(memories.length).toBeLessThanOrEqual(TEMPLATE_SPECS.reel.maxMemories);
    expect(memories.length).toBeGreaterThan(3);
  });

  it('gives videos more screen time than photos', () => {
    const { shots } = buildStoryTimeline(mem(4, 2), 'cinematic');
    const m = shots.filter((s) => s.kind === 'memory') as Extract<(typeof shots)[number], { kind: 'memory' }>[];
    expect(m.find((s) => s.memory.isVideo)!.duration).toBeGreaterThan(m.find((s) => !s.memory.isVideo)!.duration);
  });

  it('does not linger on a single photo: caps the shot and extends route + recap', () => {
    const { shots } = buildStoryTimeline(mem(1), 'reel');
    const m = shots.find((s) => s.kind === 'memory')!;
    expect(m.duration).toBeLessThanOrEqual(TEMPLATE_SPECS.reel.maxShot);
    expect(shots.find((s) => s.kind === 'route')!.duration).toBeGreaterThan(TEMPLATE_SPECS.reel.route);
  });

  it('picks memories spread over the whole trip, in order', () => {
    const picked = pickMemories([...mem(20)].reverse(), 5);
    expect(picked.map((p) => p.place)).toEqual(['P0', 'P5', 'P10', 'P14', 'P19']);
  });

  it('finds the active shot', () => {
    const { shots } = buildStoryTimeline(mem(3), 'reel');
    expect(shotAt(shots, 0).shot.kind).toBe('intro');
    expect(shotAt(shots, 4).shot.kind).toBe('route');
    expect(shotAt(shots, 29.9).shot.kind).toBe('outro');
    expect(shotAt(shots, 999).p).toBe(1);
  });

  it('makes safe file names', () => {
    expect(storyFileName('Goa Trip 2026 🌴!', 'mp4')).toBe('roam-goa-trip-2026.mp4');
    expect(storyFileName('🌴', 'webm')).toBe('roam-story.webm');
  });
});

describe('music score', () => {
  it('generates notes for each track within the duration', () => {
    for (const t of TRACKS.filter((x) => x.id !== 'none')) {
      const notes = buildScore(t.id, 30);
      expect(notes.length).toBeGreaterThan(30); // slow ambient track has the fewest notes
      expect(notes.every((n) => n.t >= 0 && n.t + n.d <= 30 + 1e-9)).toBe(true);
      expect(new Set(notes.map((n) => n.voice)).has('pad')).toBe(true);
    }
    expect(buildScore('none', 30)).toEqual([]);
  });
  it('has drums only where intended and correct tuning', () => {
    expect(buildScore('mountain', 20).some((n) => n.voice === 'kick')).toBe(false);
    expect(buildScore('wanderlust', 20).some((n) => n.voice === 'kick')).toBe(true);
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(57)).toBeCloseTo(220, 6);
  });
});
