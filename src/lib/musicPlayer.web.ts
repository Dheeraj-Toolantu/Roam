/**
 * Web Audio synthesiser for ROAM's procedural soundtracks (see logic/musicScore.ts).
 * Used for the in-app story preview and mixed into exported story videos.
 */
import { buildScore, MAX_CUSTOM_MUSIC_BYTES, type Note, type TrackId } from '../logic/musicScore';

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

/** Play a decoded song (the user's own music) into `destinations`, looped to fill `duration`, with fades. */
export function scheduleBuffer(ctx: Ctx, buffer: AudioBuffer, duration: number, destinations: AudioNode[]): MusicHandle {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = buffer.duration < duration;
  const master = ctx.createGain();
  src.connect(master);
  destinations.forEach((d) => master.connect(d));
  const now = ctx.currentTime + 0.05;
  master.gain.setValueAtTime(0.0001, now);
  master.gain.linearRampToValueAtTime(1, now + 0.6);
  master.gain.setValueAtTime(1, now + Math.max(0.6, duration - 1.8));
  master.gain.linearRampToValueAtTime(0.0001, now + duration);
  src.start(now);
  src.stop(now + duration + 0.1);
  return {
    stop() {
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
        setTimeout(() => {
          try {
            src.stop();
          } catch {
            /* already stopped */
          }
          master.disconnect();
        }, 400);
      } catch {
        /* already stopped */
      }
    },
  };
}

// ---- the user's own music (picked from the device) ----
export type CustomMusic = { name: string; sizeBytes: number };
let custom: { file: Blob; url: string; info: CustomMusic } | null = null;

/** Open the device file picker for a song (MP3, M4A, AAC, WAV, OGG…). Resolves null if cancelled. */
export function pickCustomMusic(): Promise<CustomMusic | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac,.webm';
    input.style.display = 'none';
    input.setAttribute('data-testid', 'custom-music-input');
    document.body.appendChild(input);
    const finish = () => setTimeout(() => input.remove(), 0);
    input.addEventListener('cancel', () => {
      finish();
      resolve(null);
    });
    input.addEventListener('change', () => {
      finish();
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const looksAudio = f.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i.test(f.name);
      if (!looksAudio) return reject(new Error('Please choose a music file (MP3, M4A, WAV…).'));
      if (f.size > MAX_CUSTOM_MUSIC_BYTES) return reject(new Error('That song is too large — please pick one under 25 MB.'));
      setCustomMusicFile(f, f.name);
      resolve(custom!.info);
    });
    input.click();
  });
}

export function setCustomMusicFile(file: Blob, name: string) {
  clearCustomMusic();
  custom = { file, url: URL.createObjectURL(file), info: { name: name.replace(/\.[^.]+$/, ''), sizeBytes: file.size } };
}

export function getCustomMusic(): CustomMusic | null {
  return custom?.info ?? null;
}
export function getCustomMusicFile(): Blob | null {
  return custom?.file ?? null;
}

export function clearCustomMusic() {
  stopPreviewMusic();
  if (custom) URL.revokeObjectURL(custom.url);
  custom = null;
}

/** Decode the picked song for mixing into an exported video. */
export async function decodeCustomMusic(ctx: Ctx, file: Blob): Promise<AudioBuffer> {
  const data = await file.arrayBuffer();
  try {
    return await new Promise<AudioBuffer>((res, rej) => {
      // callback form also works on older Safari
      const p = ctx.decodeAudioData(data, res, rej);
      if (p && typeof p.then === 'function') p.then(res, rej);
    });
  } catch {
    throw new Error("We couldn't read that song. Try an MP3 or M4A file.");
  }
}

// ---- simple preview controller (one at a time) ----
let previewCtx: AudioContext | null = null;
let current: MusicHandle | null = null;
let previewEl: HTMLAudioElement | null = null;

export function previewMusic(track: TrackId, offset: number, duration: number) {
  stopPreviewMusic();
  if (track === 'none') return;
  if (track === 'custom') {
    if (!custom) return;
    previewEl = new Audio(custom.url);
    previewEl.loop = true;
    try {
      previewEl.currentTime = offset;
    } catch {
      /* not seekable yet */
    }
    void previewEl.play().catch(() => {});
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  previewCtx ??= new AC();
  void previewCtx.resume();
  current = scheduleMusic(previewCtx, track, duration, [previewCtx.destination], offset);
}

export function stopPreviewMusic() {
  current?.stop();
  current = null;
  if (previewEl) {
    previewEl.pause();
    previewEl = null;
  }
}
