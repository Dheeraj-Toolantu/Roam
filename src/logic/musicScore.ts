/**
 * Procedural, royalty-free soundtrack scores for ROAM stories (pure; unit tested).
 * A score is a list of timed notes that the Web Audio player synthesises, so no
 * third-party music licensing is needed (BRD §8: "authorised music").
 */

export type TrackId = 'wanderlust' | 'sunset' | 'mountain' | 'none';

export const TRACKS: { id: TrackId; label: string; vibe: string; emoji: string }[] = [
  { id: 'wanderlust', label: 'Wanderlust', vibe: 'Upbeat pop', emoji: '🌍' },
  { id: 'sunset', label: 'Sunset Drive', vibe: 'Chill lo-fi', emoji: '🌅' },
  { id: 'mountain', label: 'Mountain Air', vibe: 'Dreamy ambient', emoji: '🏔️' },
  { id: 'none', label: 'No music', vibe: 'Silent', emoji: '🔇' },
];

export type Voice = 'pad' | 'bass' | 'pluck' | 'kick' | 'hat' | 'snare';

export interface Note {
  t: number; // start, seconds
  d: number; // duration, seconds
  voice: Voice;
  freq: number; // Hz (ignored by drums)
  vel: number; // 0..1
}

const A4 = 440;
export const midiToHz = (m: number) => A4 * Math.pow(2, (m - 69) / 12);

// chord = [root midi, quality]; voiced as triads/7ths
type Chord = number[];
const C = (root: number, q: 'maj' | 'min' | 'maj7' | 'min7' | 'sus2'): Chord => {
  const iv = { maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], sus2: [0, 2, 7] }[q];
  return iv.map((x) => root + x);
};

const SPECS: Record<Exclude<TrackId, 'none'>, { bpm: number; prog: Chord[]; drums: 'pop' | 'lofi' | 'none'; arp: boolean }> = {
  // C – G – Am – F
  wanderlust: { bpm: 112, prog: [C(60, 'maj'), C(55, 'maj'), C(57, 'min'), C(53, 'maj')], drums: 'pop', arp: true },
  // Am7 – Fmaj7 – Cmaj7 – G
  sunset: { bpm: 84, prog: [C(57, 'min7'), C(53, 'maj7'), C(60, 'maj7'), C(55, 'maj')], drums: 'lofi', arp: true },
  // Dsus2 – Bm – G – A
  mountain: { bpm: 68, prog: [C(62, 'sus2'), C(59, 'min'), C(55, 'maj'), C(57, 'maj')], drums: 'none', arp: false },
};

/** Build the full note list for `duration` seconds of `track`. */
export function buildScore(track: TrackId, duration: number): Note[] {
  if (track === 'none' || duration <= 0) return [];
  const spec = SPECS[track];
  const beat = 60 / spec.bpm;
  const bar = beat * 4;
  const notes: Note[] = [];
  const bars = Math.ceil(duration / bar);
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const chord = spec.prog[b % spec.prog.length];
    // sustained pad chord
    chord.forEach((m) => notes.push({ t: t0, d: bar * 0.98, voice: 'pad', freq: midiToHz(m), vel: 0.5 }));
    // bass on beats 1 and 3
    notes.push({ t: t0, d: beat * 1.8, voice: 'bass', freq: midiToHz(chord[0] - 24), vel: 0.8 });
    notes.push({ t: t0 + 2 * beat, d: beat * 1.8, voice: 'bass', freq: midiToHz(chord[0] - 24), vel: 0.65 });
    // 8th-note arpeggio, one octave up
    if (spec.arp) {
      for (let i = 0; i < 8; i++) {
        const m = chord[i % chord.length] + 12 + (i >= 4 ? 12 * (i % 2) : 0);
        notes.push({ t: t0 + i * (beat / 2), d: beat * 0.45, voice: 'pluck', freq: midiToHz(m), vel: i % 2 ? 0.45 : 0.6 });
      }
    }
    // drums
    if (spec.drums !== 'none') {
      for (let i = 0; i < 4; i++) {
        const t = t0 + i * beat;
        if (spec.drums === 'pop' || i % 2 === 0) notes.push({ t, d: 0.25, voice: 'kick', freq: 0, vel: i === 0 ? 1 : 0.8 });
        if (i % 2 === 1) notes.push({ t, d: 0.2, voice: 'snare', freq: 0, vel: spec.drums === 'lofi' ? 0.45 : 0.6 });
        notes.push({ t: t + beat / 2, d: 0.05, voice: 'hat', freq: 0, vel: spec.drums === 'lofi' ? 0.25 : 0.35 });
      }
    }
  }
  return notes.filter((n) => n.t < duration).map((n) => ({ ...n, d: Math.min(n.d, duration - n.t) }));
}
