/**
 * ROAM cinematic story video export (web).
 *
 * Renders the story frame-by-frame on a 720×1280 (9:16) canvas — the format used by
 * WhatsApp Status, Instagram/Facebook Stories and Reels — and records it together with
 * the procedural soundtrack using MediaRecorder. Produces MP4 where the browser supports
 * it (best for WhatsApp/Facebook), otherwise WebM.
 */
import { decodeCustomMusic, getCustomMusicFile, scheduleBuffer, scheduleMusic, type MusicHandle } from '../lib/musicPlayer.web';
import type { TrackId } from '../logic/musicScore';
import { buildStoryTimeline, shotAt, storyFileName, type Shot, type StoryMemory, type StoryStyle, type StoryTemplate } from '../logic/storyTimeline';

export const STORY_W = 720;
export const STORY_H = 1280;
const FPS = 30;

export interface StoryData {
  title: string;
  subtitle: string;
  cityName: string | null;
  cityEmoji: string | null;
  colors: [string, string];
  country: string | null;
  route: { lat: number; lng: number }[];
  places: { lat: number; lng: number; label?: string }[];
  memories: StoryMemory[];
  stats: { label: string; value: string }[];
}

export interface StoryVideoResult {
  blob: Blob;
  url: string;
  mimeType: string;
  fileName: string;
  durationSec: number;
  hasAudio: boolean;
  width: number;
  height: number;
  /** photos/videos in the story and how many could actually be drawn */
  media: { total: number; loaded: number; videos: number; videosLoaded: number };
  style: StoryStyle;
}

export interface ExportOptions {
  template: StoryTemplate;
  track: TrackId;
  style?: StoryStyle;
  onProgress?: (pct: number, stage: string) => void;
  /** also play the soundtrack through the speakers while rendering */
  monitorAudio?: boolean;
}

// ---------------- capability ----------------

export function canExportStoryVideo(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

export function pickMimeType(): { mime: string; ext: 'mp4' | 'webm' } {
  const candidates: [string, 'mp4' | 'webm'][] = [
    ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'],
    ['video/mp4;codecs=avc1,mp4a', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'webm'],
    ['video/webm;codecs=vp8,opus', 'webm'],
    ['video/webm', 'webm'],
  ];
  for (const [m, ext] of candidates) if (MediaRecorder.isTypeSupported?.(m)) return { mime: m, ext };
  return { mime: '', ext: 'webm' };
}

// ---------------- assets ----------------

type ImageAsset = { kind: 'image'; el: CanvasImageSource; w: number; h: number };
type VideoAsset = { kind: 'video'; el: HTMLVideoElement };
type Asset = ImageAsset | VideoAsset | null;

/** Longest side photos are scaled to before rendering (12 MP phone photos are too heavy to redraw 30×/s). */
const MAX_IMAGE_SIDE = 1600;

function loadImage(url: string): Promise<Asset> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // required so the canvas stays exportable
    img.decoding = 'async';
    const done = (a: Asset) => {
      clearTimeout(timer);
      resolve(a);
    };
    const timer = setTimeout(() => done(null), 20_000);
    img.onload = () => {
      const w = img.naturalWidth || STORY_W;
      const h = img.naturalHeight || STORY_H;
      const k = Math.min(1, MAX_IMAGE_SIDE / Math.max(w, h));
      if (k >= 1) return done({ kind: 'image', el: img, w, h });
      try {
        const cv = document.createElement('canvas');
        cv.width = Math.round(w * k);
        cv.height = Math.round(h * k);
        cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
        done({ kind: 'image', el: cv, w: cv.width, h: cv.height });
      } catch {
        done({ kind: 'image', el: img, w, h });
      }
    };
    img.onerror = () => done(null);
    img.src = url;
  });
}

/**
 * Off-screen holder for clip <video> elements. iOS Safari only decodes video frames for
 * elements that are in the document and have been played (it ignores preload), so clips
 * are attached here, muted + inline, and nudged with play() to start buffering.
 */
let mediaHost: HTMLDivElement | null = null;
function getMediaHost() {
  if (mediaHost?.isConnected) return mediaHost;
  mediaHost = document.createElement('div');
  mediaHost.setAttribute('aria-hidden', 'true');
  Object.assign(mediaHost.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', overflow: 'hidden', opacity: '0.01', pointerEvents: 'none', zIndex: '-1' });
  document.body.appendChild(mediaHost);
  return mediaHost;
}

function loadVideo(url: string): Promise<Asset> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';
    Object.assign(v.style, { width: '2px', height: '2px' });
    getMediaHost().appendChild(v);
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      v.pause();
      if (!ok) {
        v.removeAttribute('src');
        v.remove();
      }
      resolve(ok ? { kind: 'video', el: v } : null);
    };
    // Some browsers only report metadata until playback starts: accept that after the timeout.
    const timer = setTimeout(() => done(v.readyState >= 1 && !v.error), 20_000);
    const ready = () => v.readyState >= 2 && done(true);
    v.addEventListener('loadeddata', ready);
    v.addEventListener('canplay', ready);
    v.addEventListener('error', () => done(false));
    v.src = url;
    v.load();
    void v.play().catch(() => {});
  });
}

/** Run async jobs with limited parallelism (phones choke on many simultaneous video decoders). */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

// ---------------- drawing helpers ----------------

const ease = {
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
};
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** 0→1 over [a,b] of p */
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const rand = (i: number) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

function font(size: number, weight = 800) {
  return `${weight} ${size}px ${S?.font ?? FONT}`;
}

function gradientBg(c: CanvasRenderingContext2D, colors: string[], angle: number) {
  const r = Math.hypot(STORY_W, STORY_H) / 2;
  const cx = STORY_W / 2;
  const cy = STORY_H / 2;
  const g = c.createLinearGradient(cx - Math.cos(angle) * r, cy - Math.sin(angle) * r, cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
  colors.forEach((col, i) => g.addColorStop(i / (colors.length - 1), col));
  c.fillStyle = g;
  c.fillRect(0, 0, STORY_W, STORY_H);
}

function stars(c: CanvasRenderingContext2D, t: number, n = 60, alpha = 0.7) {
  for (let i = 0; i < n; i++) {
    const x = rand(i) * STORY_W;
    const y = (rand(i + 100) * STORY_H + t * 12 * (0.3 + rand(i + 7))) % STORY_H;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i));
    c.globalAlpha = alpha * tw;
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(x, y, 1 + rand(i + 3) * 2, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
}

function centerText(c: CanvasRenderingContext2D, text: string, y: number, size: number, color = '#fff', weight = 800, maxWidth = STORY_W - 100) {
  c.font = font(size, weight);
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.shadowColor = S.text === '#fff' || S.text.startsWith('#FE') ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.6)';
  c.shadowBlur = S.post === 'neon' ? 26 : 18;
  if (S.post === 'neon' && color === S.text) c.shadowColor = S.accent;
  c.fillText(text, STORY_W / 2, y, maxWidth);
  c.shadowBlur = 0;
}

function wrap(c: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (c.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else line = next;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '…');
  return lines;
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Draw media covering the frame with a slow Ken Burns zoom/pan. */
function drawCover(c: CanvasRenderingContext2D, el: CanvasImageSource, sw: number, sh: number, p: number, dir: number) {
  const scale = Math.max(STORY_W / sw, STORY_H / sh) * (1.06 + 0.14 * p);
  const w = sw * scale;
  const h = sh * scale;
  const dx = (STORY_W - w) / 2 + dir * 30 * (p - 0.5);
  const dy = (STORY_H - h) / 2 - 20 * (p - 0.5);
  c.drawImage(el, dx, dy, w, h);
}

function logoArch(c: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const g = c.createLinearGradient(cx - size / 2, cy + size / 2, cx + size / 2, cy - size / 2);
  g.addColorStop(0, '#22D3EE');
  g.addColorStop(0.5, '#8B5CF6');
  g.addColorStop(1, '#F97316');
  const w = size;
  const h = size * 0.9;
  const x = cx - w / 2;
  const y = cy - h / 2;
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x, y + h);
  c.lineTo(x, y + w / 2);
  c.arc(cx, y + w / 2, w / 2, Math.PI, 0);
  c.lineTo(x + w, y + h);
  c.closePath();
  c.fill();
  // inner opening
  const iw = w * 0.46;
  c.globalCompositeOperation = 'destination-out';
  c.beginPath();
  c.moveTo(cx - iw / 2, y + h);
  c.lineTo(cx - iw / 2, y + h - h * 0.5 + iw / 2);
  c.arc(cx, y + h - h * 0.5 + iw / 2, iw / 2, Math.PI, 0);
  c.lineTo(cx + iw / 2, y + h);
  c.closePath();
  c.fill();
  c.globalCompositeOperation = 'source-over';
}

// ---------------- styles (templates) ----------------

interface StyleSpec {
  /** null = use the destination's colours */
  introBg: string[] | null;
  routeBg: string[];
  statsBg: string[];
  outroBg: string[];
  text: string;
  sub: string;
  accent: string;
  accent2: string;
  tile: string;
  chip: string;
  grid: string;
  stars: boolean;
  frame: 'full' | 'polaroid' | 'card';
  post: 'none' | 'neon' | 'retro' | 'vlog';
  font: string;
}

const BASE_STYLE: StyleSpec = {
  introBg: null,
  routeBg: ['#060A1F', '#141A3F', '#0A0F2C'],
  statsBg: ['#1E1B4B', '#4C1D95', '#831843'],
  outroBg: ['#1B1050', '#5B2A86', '#C2410C'],
  text: '#fff',
  sub: 'rgba(255,255,255,0.85)',
  accent: '#22D3EE',
  accent2: '#E9D5FF',
  tile: 'rgba(255,255,255,0.12)',
  chip: 'rgba(0,0,0,0.35)',
  grid: 'rgba(255,255,255,0.05)',
  stars: true,
  frame: 'full',
  post: 'none',
  font: FONT,
};

const STYLES: Record<StoryStyle, StyleSpec> = {
  classic: BASE_STYLE,
  neon: {
    ...BASE_STYLE,
    introBg: ['#05010F', '#2E0854', '#05010F'],
    routeBg: ['#02010A', '#0B0330', '#02010A'],
    statsBg: ['#05010F', '#3B0764', '#05010F'],
    outroBg: ['#02010A', '#4A044E', '#0B0330'],
    accent: '#F0ABFC',
    accent2: '#67E8F9',
    tile: 'rgba(240,171,252,0.10)',
    grid: 'rgba(103,232,249,0.12)',
    post: 'neon',
  },
  polaroid: {
    ...BASE_STYLE,
    introBg: ['#FEF3C7', '#FBCFE8', '#DDD6FE'],
    routeBg: ['#FFFBEB', '#FEF3C7'],
    statsBg: ['#FDF2F8', '#FEF3C7'],
    outroBg: ['#FEF3C7', '#FBCFE8', '#DDD6FE'],
    text: '#1F2937',
    sub: 'rgba(31,41,55,0.75)',
    accent: '#EC4899',
    accent2: '#7C3AED',
    tile: 'rgba(255,255,255,0.75)',
    chip: 'rgba(255,255,255,0.8)',
    grid: 'rgba(31,41,55,0.06)',
    stars: false,
    frame: 'polaroid',
    font: '"Marker Felt", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive, ' + FONT,
  },
  retro: {
    ...BASE_STYLE,
    introBg: ['#1C1208', '#7C4A1E', '#1C1208'],
    routeBg: ['#1C1208', '#3B2414'],
    statsBg: ['#2A1A0C', '#7C4A1E'],
    outroBg: ['#1C1208', '#92400E', '#1C1208'],
    text: '#FEF3C7',
    sub: 'rgba(254,243,199,0.8)',
    accent: '#F59E0B',
    accent2: '#FDE68A',
    tile: 'rgba(254,243,199,0.10)',
    grid: 'rgba(254,243,199,0.06)',
    stars: false,
    post: 'retro',
    font: 'Georgia, "Times New Roman", serif',
  },
  minimal: {
    ...BASE_STYLE,
    introBg: ['#FFFFFF', '#F1F5F9'],
    routeBg: ['#FFFFFF', '#F1F5F9'],
    statsBg: ['#FFFFFF', '#F1F5F9'],
    outroBg: ['#FFFFFF', '#F1F5F9'],
    text: '#0F172A',
    sub: 'rgba(15,23,42,0.6)',
    accent: '#0EA5E9',
    accent2: '#64748B',
    tile: 'rgba(15,23,42,0.05)',
    chip: 'rgba(15,23,42,0.06)',
    grid: 'rgba(15,23,42,0.05)',
    stars: false,
    frame: 'card',
  },
  vlog: {
    ...BASE_STYLE,
    introBg: ['#F97316', '#EC4899', '#8B5CF6'],
    routeBg: ['#0F172A', '#1E293B'],
    statsBg: ['#F97316', '#EC4899', '#8B5CF6'],
    outroBg: ['#8B5CF6', '#EC4899', '#F97316'],
    accent: '#FACC15',
    accent2: '#FEF9C3',
    tile: 'rgba(0,0,0,0.25)',
    stars: false,
    post: 'vlog',
  },
};

/** Active style while drawing a frame. */
let S: StyleSpec = BASE_STYLE;

// ---------------- scenes ----------------

interface Ctx2 {
  c: CanvasRenderingContext2D;
  data: StoryData;
  assets: Map<number, Asset>;
  t: number;
  style: StyleSpec;
}

function sceneIntro({ c, data, t }: Ctx2, p: number) {
  gradientBg(c, S.introBg ?? ['#0B0628', data.colors[0], data.colors[1], '#0B0628'], 0.9 + t * 0.15);
  if (S.stars) stars(c, t, 70, 0.6);
  const pop = ease.back(seg(p, 0, 0.35));
  c.save();
  c.translate(STORY_W / 2, STORY_H * 0.36);
  c.scale(pop, pop);
  c.font = font(220, 400);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(data.cityEmoji ?? '🧭', 0, 0);
  c.restore();
  c.globalAlpha = ease.out(seg(p, 0.15, 0.45));
  centerText(c, (data.cityName ?? data.title).toUpperCase(), STORY_H * 0.56 + 30 * (1 - ease.out(seg(p, 0.15, 0.45))), 92, S.text, 900);
  c.globalAlpha = ease.out(seg(p, 0.3, 0.6));
  if (data.country) centerText(c, data.country, STORY_H * 0.62, 38, S.sub, 600);
  centerText(c, `✈️  ${data.subtitle}`, STORY_H * 0.69, 40, S.text, 700);
  c.globalAlpha = ease.out(seg(p, 0.5, 0.8));
  // title chip
  c.font = font(34, 800);
  const tw = c.measureText(data.title).width + 70;
  roundRect(c, (STORY_W - tw) / 2, STORY_H * 0.76 - 36, tw, 72, 36);
  c.fillStyle = S.chip;
  c.fill();
  centerText(c, data.title, STORY_H * 0.76, 34, S.text, 800);
  c.globalAlpha = 1;
}

function project(points: { lat: number; lng: number }[], box: { x: number; y: number; w: number; h: number }) {
  const minLat = Math.min(...points.map((p) => p.lat));
  const maxLat = Math.max(...points.map((p) => p.lat));
  const minLng = Math.min(...points.map((p) => p.lng));
  const maxLng = Math.max(...points.map((p) => p.lng));
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max(0.01, (maxLng - minLng) * kx);
  const spanY = Math.max(0.01, maxLat - minLat);
  const s = Math.min(box.w / spanX, box.h / spanY);
  const ox = box.x + (box.w - spanX * s) / 2;
  const oy = box.y + (box.h - spanY * s) / 2;
  return (p: { lat: number; lng: number }) => ({ x: ox + (p.lng - minLng) * kx * s, y: oy + (maxLat - p.lat) * s });
}

function sceneRoute({ c, data, t }: Ctx2, p: number) {
  gradientBg(c, S.routeBg, 1.2);
  // grid
  c.strokeStyle = S.grid;
  c.lineWidth = 1;
  for (let i = 0; i <= 12; i++) {
    c.beginPath();
    c.moveTo((i * STORY_W) / 12, 0);
    c.lineTo((i * STORY_W) / 12, STORY_H);
    c.stroke();
    c.beginPath();
    c.moveTo(0, (i * STORY_H) / 20);
    c.lineTo(STORY_W, (i * STORY_H) / 20);
    c.stroke();
  }
  centerText(c, 'THE ROUTE', 150, 56, S.text, 900);
  c.globalAlpha = 0.85;
  centerText(c, data.cityName ? `${data.cityEmoji ?? ''} ${data.cityName}` : data.title, 215, 34, S.sub, 600);
  c.globalAlpha = 1;
  const pts = data.route.length > 1 ? data.route : data.places;
  const box = { x: 80, y: 300, w: STORY_W - 160, h: STORY_H - 560 };
  if (pts.length > 1) {
    const proj = project([...pts, ...data.places], box);
    const drawn = Math.max(2, Math.round(pts.length * ease.inOut(seg(p, 0.05, 0.85))));
    const path = pts.slice(0, drawn).map(proj);
    // glow + line
    for (const [w, col] of [
      [22, S.accent + '2E'],
      [9, S.accent],
    ] as [number, string][]) {
      c.strokeStyle = col;
      c.lineWidth = w;
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.beginPath();
      path.forEach((q, i) => (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)));
      c.stroke();
    }
    const start = proj(pts[0]);
    c.fillStyle = '#22C55E';
    c.beginPath();
    c.arc(start.x, start.y, 14, 0, Math.PI * 2);
    c.fill();
    const head = path[path.length - 1];
    c.fillStyle = S.text;
    c.beginPath();
    c.arc(head.x, head.y, 12 + 4 * Math.sin(t * 8), 0, Math.PI * 2);
    c.fill();
    data.places.forEach((pl, i) => {
      const k = ease.back(seg(p, 0.2 + (i / Math.max(1, data.places.length)) * 0.6, 0.3 + (i / Math.max(1, data.places.length)) * 0.6));
      if (k <= 0) return;
      const q = proj(pl);
      c.fillStyle = '#EC4899';
      c.beginPath();
      c.arc(q.x, q.y, 13 * k, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#fff';
      c.lineWidth = 3;
      c.stroke();
      if (pl.label && k > 0.9) {
        c.font = font(26, 700);
        c.fillStyle = S.text;
        c.textAlign = 'center';
        c.fillText(pl.label.slice(0, 22), q.x, q.y - 28);
      }
    });
  } else {
    // no route recorded: pulsing destination pin
    const cx = STORY_W / 2;
    const cy = STORY_H / 2;
    for (let i = 0; i < 3; i++) {
      const r = ((t * 120 + i * 120) % 360) + 40;
      c.strokeStyle = `rgba(236,72,153,${1 - r / 400})`;
      c.lineWidth = 4;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.stroke();
    }
    c.font = font(160, 400);
    c.textAlign = 'center';
    c.fillText('📍', cx, cy + 50);
  }
  c.globalAlpha = ease.out(seg(p, 0.6, 0.9));
  const kmStat = data.stats.find((s) => /distance/i.test(s.label));
  centerText(c, `${data.places.length} places${kmStat ? ' · ' + kmStat.value : ''}`, STORY_H - 170, 44, S.text, 800);
  c.globalAlpha = 1;
}

/** The drawable for a memory (photo or the clip's current frame), or null to show a placeholder. */
function memorySource(asset: Asset): { el: CanvasImageSource; w: number; h: number; video: boolean } | null {
  if (asset?.kind === 'image') return { el: asset.el, w: asset.w, h: asset.h, video: false };
  if (asset?.kind === 'video' && asset.el.readyState >= 2 && asset.el.videoWidth > 0)
    return { el: asset.el, w: asset.el.videoWidth, h: asset.el.videoHeight, video: true };
  return null;
}

/** Cover-fit media inside a rounded box (clipped), with a gentle zoom. */
function drawCoverBox(c: CanvasRenderingContext2D, src: { el: CanvasImageSource; w: number; h: number }, box: { x: number; y: number; w: number; h: number }, p: number, r: number) {
  c.save();
  roundRect(c, box.x, box.y, box.w, box.h, r);
  c.clip();
  const scale = Math.max(box.w / src.w, box.h / src.h) * (1.03 + 0.07 * p);
  const w = src.w * scale;
  const h = src.h * scale;
  c.drawImage(src.el, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
  c.restore();
}

function placeholder(c: CanvasRenderingContext2D, m: StoryMemory, box: { x: number; y: number; w: number; h: number }, colorsAB: [string, string], t: number) {
  c.save();
  roundRect(c, box.x, box.y, box.w, box.h, 0);
  c.clip();
  const g = c.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
  g.addColorStop(0, colorsAB[0]);
  g.addColorStop(1, colorsAB[1]);
  c.fillStyle = g;
  c.fillRect(box.x, box.y, box.w, box.h);
  c.font = font(Math.min(box.w, box.h) * 0.3, 400);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(m.isVideo ? '🎬' : '📸', box.x + box.w / 2, box.y + box.h / 2 + 6 * Math.sin(t * 3));
  c.restore();
}

function progressBars(c: CanvasRenderingContext2D, shot: Extract<Shot, { kind: 'memory' }>, p: number, y: number, on: string, off: string) {
  const n = shot.count;
  const bw = (STORY_W - 60 - (n - 1) * 8) / n;
  for (let i = 0; i < n; i++) {
    roundRect(c, 30 + i * (bw + 8), y, bw, 7, 4);
    c.fillStyle = off;
    c.fill();
    const fill = i < shot.index ? 1 : i === shot.index ? p : 0;
    if (fill > 0) {
      roundRect(c, 30 + i * (bw + 8), y, bw * fill, 7, 4);
      c.fillStyle = on;
      c.fill();
    }
  }
}

function whenLabel(m: StoryMemory) {
  const d = new Date(m.time);
  const when = isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return [when, m.author ? `by ${m.author}` : ''].filter(Boolean).join(' · ');
}

function sceneMemory(x: Ctx2, shot: Extract<Shot, { kind: 'memory' }>, p: number) {
  if (S.frame !== 'full') return sceneMemoryFramed(x, shot, p);
  const { c, data, assets } = x;
  const m = shot.memory;
  const src = memorySource(assets.get(shot.index) ?? null);
  c.fillStyle = '#000';
  c.fillRect(0, 0, STORY_W, STORY_H);
  const dir = shot.index % 2 ? -1 : 1;
  if (src) {
    // vlog: punch-in at the cut, then settle
    const punch = S.post === 'vlog' ? 0.12 * (1 - ease.out(seg(p, 0, 0.18))) : 0;
    c.save();
    c.translate(STORY_W / 2, STORY_H / 2);
    c.scale(1 + punch, 1 + punch);
    c.translate(-STORY_W / 2, -STORY_H / 2);
    drawCover(c, src.el, src.w, src.h, src.video ? p * 0.3 : p, dir);
    c.restore();
  } else {
    gradientBg(c, shot.index % 2 ? [data.colors[1], '#1E1B4B'] : ['#1E1B4B', data.colors[0]], 0.8 + p);
    stars(c, x.t, 30, 0.4);
    c.font = font(200, 400);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(m.isVideo ? '🎬' : '📸', STORY_W / 2, STORY_H * 0.42);
  }
  // cinematic fade-in
  const fade = 1 - ease.out(seg(p, 0, 0.12));
  if (fade > 0 && S.post !== 'vlog') {
    c.fillStyle = `rgba(0,0,0,${fade})`;
    c.fillRect(0, 0, STORY_W, STORY_H);
  }
  // bottom gradient + caption
  const g = c.createLinearGradient(0, STORY_H * 0.55, 0, STORY_H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.85)');
  c.fillStyle = g;
  c.fillRect(0, STORY_H * 0.55, STORY_W, STORY_H * 0.45);
  const rise = 40 * (1 - ease.out(seg(p, 0.08, 0.35)));
  c.globalAlpha = ease.out(seg(p, 0.08, 0.35));
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  let y = STORY_H - 250 + rise;
  if (m.place) {
    c.font = font(52, 900);
    c.fillStyle = S.post === 'neon' ? S.accent2 : '#fff';
    c.shadowColor = S.post === 'neon' ? S.accent : 'rgba(0,0,0,0.6)';
    c.shadowBlur = 16;
    c.fillText(`📍 ${m.place}`.slice(0, 30), 50, y);
    y += 60;
  }
  if (m.caption) {
    c.font = font(36, 600);
    c.fillStyle = 'rgba(255,255,255,0.92)';
    for (const line of wrap(c, m.caption, STORY_W - 100, 2)) {
      c.fillText(line, 50, y);
      y += 46;
    }
  }
  c.font = font(28, 600);
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.fillText(whenLabel(m), 50, y + 6);
  c.shadowBlur = 0;
  c.globalAlpha = 1;
  progressBars(c, shot, p, S.post === 'retro' ? 96 : 40, S.post === 'neon' ? S.accent : '#fff', 'rgba(255,255,255,0.3)');
}

/** Polaroid (tilted instant photo on paper) and Minimal (clean rounded card) layouts. */
function sceneMemoryFramed(x: Ctx2, shot: Extract<Shot, { kind: 'memory' }>, p: number) {
  const { c, data, assets } = x;
  const m = shot.memory;
  const src = memorySource(assets.get(shot.index) ?? null);
  const polaroid = S.frame === 'polaroid';
  gradientBg(c, S.introBg ?? [data.colors[0], data.colors[1]], 0.7 + shot.index * 0.4 + p * 0.2);
  if (polaroid) {
    // scattered confetti dots on the "scrapbook" page
    for (let i = 0; i < 26; i++) {
      c.globalAlpha = 0.35;
      c.fillStyle = ['#F472B6', '#A78BFA', '#FBBF24', '#34D399'][i % 4];
      c.beginPath();
      c.arc(rand(i + shot.index * 31) * STORY_W, rand(i + 50 + shot.index * 17) * STORY_H, 4 + rand(i + 9) * 6, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }
  const enter = ease.back(seg(p, 0, 0.22));
  const cardW = polaroid ? 600 : 640;
  const photoH = polaroid ? 660 : 880;
  const pad = polaroid ? 28 : 0;
  const cardH = polaroid ? photoH + pad + 190 : photoH;
  const cx = STORY_W / 2;
  const cy = polaroid ? STORY_H * 0.46 : 140 + cardH / 2;
  const tilt = polaroid ? ((shot.index % 2 ? -1 : 1) * (4 - 2 * p) * Math.PI) / 180 : 0;
  c.save();
  c.translate(cx, cy + (1 - enter) * 500);
  c.rotate(tilt);
  c.globalAlpha = clamp01(enter * 1.5);
  // card + shadow
  c.shadowColor = 'rgba(0,0,0,0.28)';
  c.shadowBlur = 40;
  c.shadowOffsetY = 18;
  roundRect(c, -cardW / 2, -cardH / 2, cardW, cardH, polaroid ? 10 : 36);
  c.fillStyle = '#fff';
  c.fill();
  c.shadowColor = 'transparent';
  c.shadowBlur = 0;
  c.shadowOffsetY = 0;
  const box = { x: -cardW / 2 + pad, y: -cardH / 2 + pad, w: cardW - pad * 2, h: photoH };
  if (src) drawCoverBox(c, src, box, p, polaroid ? 4 : 36);
  else placeholder(c, m, box, [data.colors[0], data.colors[1]], x.t);
  if (polaroid) {
    // tape
    c.fillStyle = 'rgba(253,230,138,0.85)';
    c.save();
    c.translate(0, -cardH / 2);
    c.rotate(-0.05);
    c.fillRect(-70, -20, 140, 40);
    c.restore();
    // handwritten caption on the white strip
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#1F2937';
    c.font = font(44, 700);
    c.fillText((m.place ? `📍 ${m.place}` : m.caption || 'Memory').slice(0, 26), 0, cardH / 2 - 120, cardW - 60);
    c.font = font(30, 400);
    c.fillStyle = 'rgba(31,41,55,0.7)';
    const sub = m.place && m.caption ? m.caption : whenLabel(m);
    c.fillText(sub.slice(0, 40), 0, cardH / 2 - 60, cardW - 60);
  }
  c.restore();
  c.globalAlpha = 1;
  if (!polaroid) {
    // minimal: clean type under the card
    const a = ease.out(seg(p, 0.1, 0.35));
    c.globalAlpha = a;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    let y = 140 + cardH + 90 + 20 * (1 - a);
    if (m.place) {
      c.font = font(50, 900);
      c.fillStyle = S.text;
      c.fillText(m.place.slice(0, 26), 60, y);
      y += 56;
    }
    if (m.caption) {
      c.font = font(32, 500);
      c.fillStyle = S.sub;
      for (const line of wrap(c, m.caption, STORY_W - 120, 2)) {
        c.fillText(line, 60, y);
        y += 42;
      }
    }
    c.font = font(26, 600);
    c.fillStyle = S.accent;
    c.fillText(whenLabel(m), 60, y + 8);
    c.globalAlpha = 1;
  }
  progressBars(c, shot, p, 40, S.accent, 'rgba(15,23,42,0.12)');
}

function sceneStats({ c, data, t }: Ctx2, p: number) {
  gradientBg(c, S.statsBg, 0.6 + t * 0.1);
  if (S.stars) stars(c, t, 40, 0.5);
  c.globalAlpha = ease.out(seg(p, 0, 0.2));
  centerText(c, 'TRIP RECAP ✨', 220, 64, S.text, 900);
  centerText(c, data.title, 300, 38, S.sub, 700);
  c.globalAlpha = 1;
  const stats = data.stats.slice(0, 6);
  const cols = 2;
  const tw = 290;
  const th = 190;
  const gap = 30;
  const x0 = (STORY_W - (cols * tw + gap)) / 2;
  const y0 = 400;
  stats.forEach((s, i) => {
    const k = ease.back(seg(p, 0.1 + i * 0.1, 0.3 + i * 0.1));
    if (k <= 0) return;
    const x = x0 + (i % cols) * (tw + gap);
    const y = y0 + Math.floor(i / cols) * (th + gap);
    c.save();
    c.translate(x + tw / 2, y + th / 2);
    c.scale(k, k);
    roundRect(c, -tw / 2, -th / 2, tw, th, 32);
    c.fillStyle = S.tile;
    c.fill();
    c.strokeStyle = S.post === 'neon' ? S.accent : 'rgba(127,127,127,0.25)';
    c.lineWidth = 2;
    c.stroke();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(64, 900);
    c.fillStyle = S.text;
    c.fillText(s.value, 0, -18, tw - 30);
    c.font = font(28, 700);
    c.fillStyle = S.accent2;
    c.fillText(s.label, 0, 50);
    c.restore();
  });
}

function sceneOutro({ c, data, t }: Ctx2, p: number) {
  gradientBg(c, S.outroBg, 0.8 + t * 0.1);
  if (S.stars) stars(c, t, 50, 0.6);
  const k = ease.back(seg(p, 0, 0.4));
  c.save();
  c.translate(STORY_W / 2, STORY_H * 0.38);
  c.scale(k, k);
  logoArch(c, 0, 0, 200);
  c.restore();
  c.globalAlpha = ease.out(seg(p, 0.2, 0.5));
  centerText(c, 'ROAM', STORY_H * 0.52, 96, S.text, 900);
  centerText(c, data.title, STORY_H * 0.59, 40, S.text, 700);
  centerText(c, 'Every journey has a story ✨', STORY_H * 0.66, 34, S.sub, 600);
  c.globalAlpha = ease.out(seg(p, 0.45, 0.75));
  centerText(c, 'Made with ROAM 2.0', STORY_H - 140, 30, S.sub, 700);
  c.globalAlpha = 1;
}

function drawFrame(x: Ctx2, shots: Shot[], prevIdx: { i: number }) {
  S = x.style;
  const { shot, p, i } = shotAt(shots, x.t);
  // start/stop video clips as their shots begin/end
  if (i !== prevIdx.i) {
    const prev = shots[prevIdx.i];
    if (prev?.kind === 'memory') {
      const a = x.assets.get(prev.index);
      if (a?.kind === 'video') a.el.pause();
    }
    if (shot.kind === 'memory') {
      const a = x.assets.get(shot.index);
      if (a?.kind === 'video') {
        a.el.currentTime = Math.min(1, (a.el.duration || 2) / 4);
        void a.el.play().catch(() => {});
      }
    }
    prevIdx.i = i;
  }
  x.c.save();
  switch (shot.kind) {
    case 'intro':
      sceneIntro(x, p);
      break;
    case 'route':
      sceneRoute(x, p);
      break;
    case 'memory':
      sceneMemory(x, shot, p);
      break;
    case 'stats':
      sceneStats(x, p);
      break;
    case 'outro':
      sceneOutro(x, p);
      break;
  }
  x.c.restore();
  // ROAM watermark (after intro)
  if (shot.kind !== 'intro' && shot.kind !== 'outro') {
    x.c.globalAlpha = 0.85;
    x.c.font = font(28, 900);
    x.c.fillStyle = shot.kind === 'memory' && S.frame === 'full' ? '#fff' : S.text;
    x.c.textAlign = 'right';
    x.c.textBaseline = 'alphabetic';
    x.c.fillText('ROAM ✦', STORY_W - 34, shot.kind === 'memory' ? (S.post === 'retro' ? 148 : 92) : 70);
    x.c.globalAlpha = 1;
  }
  postEffects(x, shot, p);
  // transition between shots: white flash for vlog cuts, dip-to-black otherwise
  const edge = Math.min(x.t - shot.start, shot.start + shot.duration - x.t);
  if (S.post === 'vlog' && x.t - shot.start < 0.12 && shot.start > 0) {
    x.c.fillStyle = `rgba(255,255,255,${0.8 * (1 - (x.t - shot.start) / 0.12)})`;
    x.c.fillRect(0, 0, STORY_W, STORY_H);
  } else if (edge < 0.15 && shot.kind !== 'memory') {
    x.c.fillStyle = `rgba(0,0,0,${0.5 * (1 - edge / 0.15)})`;
    x.c.fillRect(0, 0, STORY_W, STORY_H);
  }
}

/** Style-specific overlays drawn on top of every frame. */
function postEffects(x: Ctx2, shot: Shot, p: number) {
  const c = x.c;
  const t = x.t;
  if (S.post === 'neon') {
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = (Math.floor(t * 60) % 4); y < STORY_H; y += 4) c.fillRect(0, y, STORY_W, 1);
    const g = c.createRadialGradient(STORY_W / 2, STORY_H / 2, STORY_H * 0.3, STORY_W / 2, STORY_H / 2, STORY_H * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(${Math.sin(t * 2) > 0 ? '236,72,153' : '34,211,238'},0.35)`);
    c.fillStyle = g;
    c.fillRect(0, 0, STORY_W, STORY_H);
  } else if (S.post === 'retro') {
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = 'rgba(255,214,160,0.55)';
    c.fillRect(0, 0, STORY_W, STORY_H);
    c.globalCompositeOperation = 'source-over';
    // film grain + flicker
    const f = Math.floor(t * 24);
    c.fillStyle = 'rgba(255,240,210,0.08)';
    for (let i = 0; i < 260; i++) c.fillRect(rand(i + f * 977) * STORY_W, rand(i * 3 + f * 131) * STORY_H, 2, 2);
    c.fillStyle = `rgba(0,0,0,${0.04 + 0.04 * rand(f)})`;
    c.fillRect(0, 0, STORY_W, STORY_H);
    // occasional scratch
    if (rand(f * 7) > 0.8) {
      c.fillStyle = 'rgba(255,255,255,0.25)';
      c.fillRect(rand(f * 13) * STORY_W, 0, 2, STORY_H);
    }
    const g = c.createRadialGradient(STORY_W / 2, STORY_H / 2, STORY_H * 0.25, STORY_W / 2, STORY_H / 2, STORY_H * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(20,10,0,0.6)');
    c.fillStyle = g;
    c.fillRect(0, 0, STORY_W, STORY_H);
    // letterbox
    c.fillStyle = '#000';
    c.fillRect(0, 0, STORY_W, 70);
    c.fillRect(0, STORY_H - 70, STORY_W, 70);
  } else if (S.post === 'vlog' && shot.kind === 'memory') {
    // REC badge + timecode
    const on = Math.floor(t * 2) % 2 === 0;
    c.fillStyle = on ? '#EF4444' : 'rgba(239,68,68,0.3)';
    c.beginPath();
    c.arc(52, 100, 11, 0, Math.PI * 2);
    c.fill();
    c.font = font(26, 900);
    c.fillStyle = '#fff';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    const secs = Math.floor(t);
    c.fillText(`REC  00:${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`, 74, 101);
    // corner brackets
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 4;
    const k = 46;
    for (const [cx, cy, dx, dy] of [[30, 140, 1, 1], [STORY_W - 30, 140, -1, 1], [30, STORY_H - 30, 1, -1], [STORY_W - 30, STORY_H - 30, -1, -1]]) {
      c.beginPath();
      c.moveTo(cx, cy + dy * k);
      c.lineTo(cx, cy);
      c.lineTo(cx + dx * k, cy);
      c.stroke();
    }
    void p;
  }
}

// ---------------- render ----------------

/** Draw one frame at time `t` (used for the live preview/poster). */
export function renderStoryFrame(canvas: HTMLCanvasElement, data: StoryData, template: StoryTemplate, t: number, style: StoryStyle = 'classic') {
  const { shots } = buildStoryTimeline(data.memories, template);
  const c = canvas.getContext('2d')!;
  c.save();
  c.scale(canvas.width / STORY_W, canvas.height / STORY_H);
  drawFrame({ c, data, assets: new Map(), t, style: STYLES[style] }, shots, { i: -1 });
  c.restore();
}

/** Time (s) of the first memory shot, for style thumbnails. */
export function firstMemoryTime(data: StoryData, template: StoryTemplate) {
  const s = buildStoryTimeline(data.memories, template).shots.find((x) => x.kind === 'memory');
  return s ? s.start + s.duration * 0.6 : 1.5;
}

export async function renderStoryVideo(data: StoryData, opts: ExportOptions): Promise<StoryVideoResult> {
  if (!canExportStoryVideo()) throw new Error('Video export is not supported in this browser. Try Chrome, Edge, Safari or Firefox.');
  const { shots, duration } = buildStoryTimeline(data.memories, opts.template);
  const progress = opts.onProgress ?? (() => {});

  const style = opts.style ?? 'classic';

  // 0. Audio must be created and unlocked synchronously inside the tap (iOS Safari only
  //    allows it during the user gesture; awaiting the media downloads first would leave the
  //    AudioContext suspended forever and the export would hang).
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const customFile = opts.track === 'custom' ? getCustomMusicFile() : null;
  if (opts.track === 'custom' && !customFile) throw new Error('Pick a song from your device first (Music → My music).');
  const audio = opts.track !== 'none' && AC ? new AC() : null;
  let unlocked: Promise<unknown> = Promise.resolve();
  if (audio) {
    unlocked = audio.resume().catch(() => {});
    try {
      const silent = audio.createBuffer(1, 1, 22050);
      const src = audio.createBufferSource();
      src.buffer = silent;
      src.connect(audio.destination);
      src.start(0);
    } catch {
      /* ignore */
    }
  }

  const cleanup: (() => void)[] = [];
  try {
    // 1. load photos & videos used in the story (a few at a time — phones have limited decoders)
    progress(0, 'Collecting your photos & videos…');
    const memoryShots = shots.filter((s): s is Extract<Shot, { kind: 'memory' }> => s.kind === 'memory');
    const assets = new Map<number, Asset>();
    let done = 0;
    await pool(memoryShots, 3, async (s) => {
      const a = s.memory.url ? await (s.memory.isVideo ? loadVideo(s.memory.url) : loadImage(s.memory.url)) : null;
      assets.set(s.index, a);
      if (a?.kind === 'video') cleanup.push(() => {
        a.el.pause();
        a.el.removeAttribute('src');
        a.el.load();
        a.el.remove();
      });
      progress((++done / Math.max(1, memoryShots.length)) * 8, `Collecting your photos & videos… ${done}/${memoryShots.length}`);
    });
    const media = {
      total: memoryShots.length,
      loaded: [...assets.values()].filter(Boolean).length,
      videos: memoryShots.filter((s) => s.memory.isVideo).length,
      videosLoaded: [...assets.values()].filter((a) => a?.kind === 'video').length,
    };
    const songBuffer = audio && customFile ? await decodeCustomMusic(audio, customFile) : null;

    // 2. canvas + audio graph
    const canvas = document.createElement('canvas');
    canvas.width = STORY_W;
    canvas.height = STORY_H;
    const c = canvas.getContext('2d')!;
    if (audio) await Promise.race([unlocked, new Promise((r) => setTimeout(r, 1500))]);
    const dest = audio?.createMediaStreamDestination() ?? null;
    const videoStream = canvas.captureStream(FPS);
    const tracks = [...videoStream.getVideoTracks(), ...(dest?.stream.getAudioTracks() ?? [])];
    cleanup.push(() => tracks.forEach((tr) => tr.stop()));
    const stream = new MediaStream(tracks);
    const { mime, ext } = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 });
    } catch {
      recorder = new MediaRecorder(stream); // let the browser pick its default format
    }
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((r) => (recorder.onstop = () => r()));
    const failed = new Promise<never>((_, rej) => (recorder.onerror = (e) => rej(new Error(`Recording failed: ${(e as unknown as { error?: Error }).error?.message ?? 'unknown error'}`))));
    failed.catch(() => {});

    // draw first frame before recording starts
    const x: Ctx2 = { c, data, assets, t: 0, style: STYLES[style] };
    const prevIdx = { i: -1 };
    drawFrame(x, shots, prevIdx);

    recorder.start(250);
    const outs = dest && audio ? (opts.monitorAudio ? [dest, audio.destination] : [dest]) : [];
    let music: MusicHandle | null = null;
    if (audio && dest) music = songBuffer ? scheduleBuffer(audio, songBuffer, duration, outs) : scheduleMusic(audio, opts.track, duration, outs);
    cleanup.push(() => music?.stop());
    const t0 = performance.now();

    // 3. real-time render loop (MediaRecorder records wall-clock time)
    await Promise.race([
      failed,
      new Promise<void>((resolve) => {
        let lastPct = -1;
        const tick = () => {
          x.t = (performance.now() - t0) / 1000;
          if (x.t >= duration) {
            x.t = duration - 0.001;
            drawFrame(x, shots, prevIdx);
            resolve();
            return;
          }
          drawFrame(x, shots, prevIdx);
          const pct = Math.floor(8 + (x.t / duration) * 90);
          if (pct !== lastPct) {
            lastPct = pct;
            progress(pct, 'Rendering your cinematic story…');
          }
          if (typeof document !== 'undefined' && document.hidden) setTimeout(tick, 1000 / FPS);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    ]);

    // 4. finish
    progress(99, 'Finishing video…');
    await new Promise((r) => setTimeout(r, 300));
    recorder.stop();
    await Promise.race([stopped, failed]);

    const type = (recorder.mimeType || mime || chunks[0]?.type || `video/${ext}`).split(';')[0];
    const blob = new Blob(chunks, { type });
    if (!blob.size) throw new Error('The recording came out empty. Please try again, and keep this tab open while it records.');
    progress(100, 'Your story is ready! 🎉');
    return {
      blob,
      url: URL.createObjectURL(blob),
      mimeType: type,
      fileName: storyFileName(data.title, type.includes('mp4') ? 'mp4' : 'webm'),
      durationSec: duration,
      hasAudio: !!dest,
      width: STORY_W,
      height: STORY_H,
      media,
      style,
    };
  } finally {
    cleanup.forEach((f) => {
      try {
        f();
      } catch {
        /* ignore */
      }
    });
    await audio?.close().catch(() => {});
  }
}

// ---------------- share ----------------

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

export function canShareFiles(res: StoryVideoResult): boolean {
  try {
    const file = new File([res.blob], res.fileName, { type: res.mimeType });
    return typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Share the video with the system share sheet (WhatsApp, Facebook, Instagram, …)
 * on phones/tablets; falls back to downloading the file.
 */
export async function shareStoryVideo(res: StoryVideoResult, title: string): Promise<ShareOutcome> {
  const file = new File([res.blob], res.fileName, { type: res.mimeType });
  if (canShareFiles(res)) {
    try {
      await navigator.share({ files: [file], title, text: `${title} ✨ — made with ROAM` });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  downloadStoryVideo(res);
  return 'downloaded';
}

export function downloadStoryVideo(res: StoryVideoResult) {
  const a = document.createElement('a');
  a.href = res.url;
  a.download = res.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
