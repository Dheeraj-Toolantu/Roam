/**
 * Builds the shot list for a cinematic story video (pure; unit tested).
 * Scenes follow BRD §8: intro → route → memories (photos/videos) → summary → outro.
 */

export type StoryTemplate = 'reel' | 'cinematic';

export interface StoryMemory {
  url: string | null;
  isVideo: boolean;
  place: string | null;
  time: number;
  caption?: string;
  author?: string;
}

export type Shot =
  | { kind: 'intro'; start: number; duration: number }
  | { kind: 'route'; start: number; duration: number }
  | { kind: 'memory'; start: number; duration: number; memory: StoryMemory; index: number; count: number }
  | { kind: 'stats'; start: number; duration: number }
  | { kind: 'outro'; start: number; duration: number };

export const TEMPLATE_SPECS: Record<StoryTemplate, { total: number; intro: number; route: number; stats: number; outro: number; minShot: number; maxShot: number; maxVideo: number; maxMemories: number }> = {
  // 30 s fits WhatsApp Status, Instagram/Facebook Stories and Reels
  reel: { total: 30, intro: 3, route: 4, stats: 3.5, outro: 2.5, minShot: 1.8, maxShot: 3.5, maxVideo: 5, maxMemories: 10 },
  cinematic: { total: 60, intro: 5, route: 7, stats: 6, outro: 4, minShot: 2.5, maxShot: 5, maxVideo: 8, maxMemories: 18 },
};

/** Pick at most `n` memories spread evenly over the trip, keeping chronological order. */
export function pickMemories(memories: StoryMemory[], n: number): StoryMemory[] {
  const sorted = [...memories].sort((a, b) => a.time - b.time);
  if (sorted.length <= n) return sorted;
  const out: StoryMemory[] = [];
  for (let i = 0; i < n; i++) out.push(sorted[Math.round((i * (sorted.length - 1)) / (n - 1))]);
  return out;
}

export function buildStoryTimeline(memories: StoryMemory[], template: StoryTemplate): { shots: Shot[]; duration: number } {
  const spec = TEMPLATE_SPECS[template];
  const shots: Shot[] = [];
  let t = 0;
  const push = (s: Shot) => {
    shots.push(s);
    t += s.duration;
  };
  push({ kind: 'intro', start: t, duration: spec.intro });
  push({ kind: 'route', start: t, duration: spec.route });

  const budget = spec.total - spec.intro - spec.route - spec.stats - spec.outro;
  let extraStats = 0;
  const maxCount = Math.max(1, Math.floor(budget / spec.minShot));
  const chosen = pickMemories(memories, Math.min(spec.maxMemories, maxCount));
  if (chosen.length) {
    // Videos get a bit more time than photos; then scale to fill the memories budget exactly.
    const weights = chosen.map((m) => (m.isVideo ? 1.5 : 1));
    const sum = weights.reduce((a, b) => a + b, 0);
    // Proportional to weight (videos 1.5×) with a minimum per shot, rescaled to fill the budget.
    let durations = weights.map((w) => Math.max(spec.minShot, (w / sum) * budget));
    const scale = budget / durations.reduce((a, b) => a + b, 0);
    durations = durations.map((d) => d * scale);
    // With few memories, don't linger: cap shots and give spare time to the route + recap scenes.
    const cap = (i: number) => (chosen[i].isVideo ? spec.maxVideo : spec.maxShot);
    if (durations.some((d, i) => d > cap(i))) {
      const capped = durations.map((d, i) => Math.min(d, cap(i)));
      const spare = budget - capped.reduce((a, b) => a + b, 0);
      durations = capped;
      shots[1] = { ...shots[1], duration: shots[1].duration + spare * 0.5 };
      t = shots[0].duration + shots[1].duration;
      extraStats = spare * 0.5;
    }
    chosen.forEach((m, i) => push({ kind: 'memory', start: t, duration: durations[i], memory: m, index: i, count: chosen.length }));
  } else {
    // no photos/videos: give the time to the route + stats scenes
    shots[1] = { ...shots[1], duration: shots[1].duration + budget / 2 };
    t = shots[0].duration + shots[1].duration;
    push({ kind: 'stats', start: t, duration: spec.stats + budget / 2 });
    push({ kind: 'outro', start: t, duration: spec.outro });
    return { shots, duration: round(t) };
  }
  push({ kind: 'stats', start: t, duration: spec.stats + extraStats });
  push({ kind: 'outro', start: t, duration: spec.outro });
  return { shots, duration: round(t) };
}

/** Shot active at time `t` (seconds) and progress 0..1 within it. */
export function shotAt(shots: Shot[], t: number): { shot: Shot; p: number; i: number } {
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    if (t < s.start + s.duration || i === shots.length - 1) return { shot: s, p: Math.max(0, Math.min(1, (t - s.start) / s.duration)), i };
  }
  return { shot: shots[0], p: 0, i: 0 };
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function storyFileName(title: string, ext: string) {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `roam-${slug || 'story'}.${ext}`;
}
