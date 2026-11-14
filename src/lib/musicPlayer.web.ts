/**
 * Web Audio synthesiser for ROAM's procedural soundtracks (see logic/musicScore.ts).
 * Used for the in-app story preview and mixed into exported story videos.
 */
import { buildScore, type Note, type TrackId } from '../logic/musicScore';

type Ctx = AudioContext;

function noiseBuffer(ctx: Ctx) {
  const b = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = b.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 16807) % 2147483647; // deterministic noise
    d[i] = (seed / 2147483647) * 2 - 1;
  }
  return b;
}

function playNote(ctx: Ctx, out: AudioNode, n: Note, at: number, noise: AudioBuffer, fx: AudioNode) {
  const t = at + n.t;
  const g = ctx.createGain();
  g.connect(out);
  const env = (peak: number, attack: number, release: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, Math.max(t + attack, t + n.d - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + n.d + 0.05);
  };
  switch (n.voice) {
    case 'pad': {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      lp.connect(g);
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = n.freq;
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + n.d + 0.1);
      }
      env(0.05 * n.vel, Math.min(0.5, n.d / 3), 0.5);
      break;
    }
    case 'bass': {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = n.freq;
      o.connect(g);
      o.start(t);
      o.stop(t + n.d + 0.1);
      env(0.22 * n.vel, 0.01, 0.15);
      break;
    }
    case 'pluck': {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = n.freq;
      o.connect(g);
      g.connect(fx); // shimmer delay
      o.start(t);
      o.stop(t + n.d + 0.1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.09 * n.vel, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.12, n.d));
      break;
    }
    case 'kick': {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.3);
      g.gain.setValueAtTime(0.8 * n.vel, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      break;
    }
    case 'snare':
    case 'hat': {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = n.voice === 'hat' ? 7000 : 1500;
      src.connect(hp);
      hp.connect(g);
      const len = n.voice === 'hat' ? 0.05 : 0.16;
      g.gain.setValueAtTime((n.voice === 'hat' ? 0.1 : 0.22) * n.vel, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.start(t);
      src.stop(t + len + 0.02);
      break;
    }
  }
}

export interface MusicHandle {
  stop(): void;
}

/**
 * Schedule `track` on `ctx`, starting `offset` seconds into the song, lasting until
 * `duration`. Output goes to `destinations` (speakers and/or a recording stream).
 */
export function scheduleMusic(ctx: Ctx, track: TrackId, duration: number, destinations: AudioNode[], offset = 0): MusicHandle {
  const notes = buildScore(track, duration).filter((n) => n.t + n.d > offset);
  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp);
  destinations.forEach((d) => comp.connect(d));
  // fade in / out
  const now = ctx.currentTime + 0.05;
  const remaining = duration - offset;
  master.gain.setValueAtTime(0.0001, now);
  master.gain.linearRampToValueAtTime(0.9, now + Math.min(1, remaining / 4));
  master.gain.setValueAtTime(0.9, now + Math.max(0, remaining - 1.5));
  master.gain.linearRampToValueAtTime(0.0001, now + remaining);
  // shimmer delay for plucks
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.28;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  delay.connect(fb);
  fb.connect(delay);
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  delay.connect(wet);
  wet.connect(master);

  const noise = noiseBuffer(ctx);
  for (const n of notes) {
    const shifted = { ...n, t: Math.max(0, n.t - offset), d: n.t < offset ? n.d - (offset - n.t) : n.d };
    if (shifted.d > 0.01) playNote(ctx, master, shifted, now, noise, delay);
  }
  return {
    stop() {
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
        setTimeout(() => master.disconnect(), 400);
      } catch {
        /* already stopped */
      }
    },
  };
}

// ---- simple preview controller (one at a time) ----
let previewCtx: AudioContext | null = null;
let current: MusicHandle | null = null;

export function previewMusic(track: TrackId, offset: number, duration: number) {
  stopPreviewMusic();
  if (track === 'none') return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  previewCtx ??= new AC();
  void previewCtx.resume();
  current = scheduleMusic(previewCtx, track, duration, [previewCtx.destination], offset);
}

export function stopPreviewMusic() {
  current?.stop();
  current = null;
}
