/**
 * ROAM cinematic story video export (web).
 *
 * Renders the story frame-by-frame on a 720×1280 (9:16) canvas — the format used by
 * WhatsApp Status, Instagram/Facebook Stories and Reels — and records it together with
 * the procedural soundtrack using MediaRecorder. Produces MP4 where the browser supports
 * it (best for WhatsApp/Facebook), otherwise WebM.
 */
import { scheduleMusic } from '../lib/musicPlayer.web';
import type { TrackId } from '../logic/musicScore';
import { buildStoryTimeline, shotAt, storyFileName, type Shot, type StoryMemory, type StoryTemplate } from '../logic/storyTimeline';

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
}

export interface ExportOptions {
  template: StoryTemplate;
  track: TrackId;
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

type Asset = { kind: 'image'; el: HTMLImageElement } | { kind: 'video'; el: HTMLVideoElement } | null;

function loadImage(url: string): Promise<Asset> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // required so the canvas stays exportable
    const done = (a: Asset) => {
      clearTimeout(timer);
      resolve(a);
    };
    const timer = setTimeout(() => done(null), 10_000);
    img.onload = () => done({ kind: 'image', el: img });
    img.onerror = () => done(null);
    img.src = url;
  });
}

function loadVideo(url: string): Promise<Asset> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    const done = (a: Asset) => {
      clearTimeout(timer);
      resolve(a);
    };
    const timer = setTimeout(() => done(null), 12_000);
    v.onloadeddata = () => done({ kind: 'video', el: v });
    v.onerror = () => done(null);
    v.src = url;
    v.load();
  });
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
  return `${weight} ${size}px ${FONT}`;
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
  c.shadowColor = 'rgba(0,0,0,0.45)';
  c.shadowBlur = 18;
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

// ---------------- scenes ----------------

interface Ctx2 {
  c: CanvasRenderingContext2D;
  data: StoryData;
  assets: Map<number, Asset>;
  t: number;
}

function sceneIntro({ c, data, t }: Ctx2, p: number) {
  gradientBg(c, ['#0B0628', data.colors[0], data.colors[1], '#0B0628'], 0.9 + t * 0.15);
  stars(c, t, 70, 0.6);
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
  centerText(c, (data.cityName ?? data.title).toUpperCase(), STORY_H * 0.56 + 30 * (1 - ease.out(seg(p, 0.15, 0.45))), 92, '#fff', 900);
  c.globalAlpha = ease.out(seg(p, 0.3, 0.6));
  if (data.country) centerText(c, data.country, STORY_H * 0.62, 38, 'rgba(255,255,255,0.85)', 600);
  centerText(c, `✈️  ${data.subtitle}`, STORY_H * 0.69, 40, '#fff', 700);
  c.globalAlpha = ease.out(seg(p, 0.5, 0.8));
  // title chip
  c.font = font(34, 800);
  const tw = c.measureText(data.title).width + 70;
  roundRect(c, (STORY_W - tw) / 2, STORY_H * 0.76 - 36, tw, 72, 36);
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.fill();
  centerText(c, data.title, STORY_H * 0.76, 34, '#fff', 800);
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
  gradientBg(c, ['#060A1F', '#141A3F', '#0A0F2C'], 1.2);
  // grid
  c.strokeStyle = 'rgba(255,255,255,0.05)';
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
  centerText(c, 'THE ROUTE', 150, 56, '#fff', 900);
  c.globalAlpha = 0.85;
  centerText(c, data.cityName ? `${data.cityEmoji ?? ''} ${data.cityName}` : data.title, 215, 34, '#A7B0D6', 600);
  c.globalAlpha = 1;
  const pts = data.route.length > 1 ? data.route : data.places;
  const box = { x: 80, y: 300, w: STORY_W - 160, h: STORY_H - 560 };
  if (pts.length > 1) {
    const proj = project([...pts, ...data.places], box);
    const drawn = Math.max(2, Math.round(pts.length * ease.inOut(seg(p, 0.05, 0.85))));
    const path = pts.slice(0, drawn).map(proj);
    // glow + line
    for (const [w, col] of [
      [22, 'rgba(34,211,238,0.18)'],
      [9, '#22D3EE'],
    ] as const) {
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
    c.fillStyle = '#fff';
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
        c.fillStyle = '#fff';
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
  centerText(c, `${data.places.length} places${kmStat ? ' · ' + kmStat.value : ''}`, STORY_H - 170, 44, '#fff', 800);
  c.globalAlpha = 1;
}

function sceneMemory(x: Ctx2, shot: Extract<Shot, { kind: 'memory' }>, p: number) {
  const { c, data, assets } = x;
  const m = shot.memory;
  const asset = assets.get(shot.index) ?? null;
  c.fillStyle = '#000';
  c.fillRect(0, 0, STORY_W, STORY_H);
  const dir = shot.index % 2 ? -1 : 1;
  if (asset?.kind === 'image') {
    drawCover(c, asset.el, asset.el.naturalWidth || STORY_W, asset.el.naturalHeight || STORY_H, p, dir);
  } else if (asset?.kind === 'video' && asset.el.readyState >= 2) {
    drawCover(c, asset.el, asset.el.videoWidth || STORY_W, asset.el.videoHeight || STORY_H, p * 0.3, dir);
  } else {
    gradientBg(c, shot.index % 2 ? [data.colors[1], '#1E1B4B'] : ['#1E1B4B', data.colors[0]], 0.8 + p);
    stars(c, x.t, 30, 0.4);
    c.font = font(200, 400);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(m.isVideo ? '🎬' : '📸', STORY_W / 2, STORY_H * 0.42);
  }
  // cinematic letterbox fade-in
  const fade = 1 - ease.out(seg(p, 0, 0.12));
  if (fade > 0) {
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
    c.fillStyle = '#fff';
    c.shadowColor = 'rgba(0,0,0,0.6)';
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
  const when = new Date(m.time).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  c.fillText(`${when}${m.author ? ` · by ${m.author}` : ''}`, 50, y + 6);
  c.shadowBlur = 0;
  c.globalAlpha = 1;
  // story progress bars at the top
  const n = shot.count;
  const bw = (STORY_W - 60 - (n - 1) * 8) / n;
  for (let i = 0; i < n; i++) {
    roundRect(c, 30 + i * (bw + 8), 40, bw, 7, 4);
    c.fillStyle = 'rgba(255,255,255,0.3)';
    c.fill();
    const fill = i < shot.index ? 1 : i === shot.index ? p : 0;
    if (fill > 0) {
      roundRect(c, 30 + i * (bw + 8), 40, bw * fill, 7, 4);
      c.fillStyle = '#fff';
      c.fill();
    }
  }
}

function sceneStats({ c, data, t }: Ctx2, p: number) {
  gradientBg(c, ['#1E1B4B', '#4C1D95', '#831843'], 0.6 + t * 0.1);
  stars(c, t, 40, 0.5);
  c.globalAlpha = ease.out(seg(p, 0, 0.2));
  centerText(c, 'TRIP RECAP ✨', 220, 64, '#fff', 900);
  centerText(c, data.title, 300, 38, 'rgba(255,255,255,0.85)', 700);
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
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.lineWidth = 2;
    c.stroke();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(64, 900);
    c.fillStyle = '#fff';
    c.fillText(s.value, 0, -18, tw - 30);
    c.font = font(28, 700);
    c.fillStyle = '#E9D5FF';
    c.fillText(s.label, 0, 50);
    c.restore();
  });
}

function sceneOutro({ c, data, t }: Ctx2, p: number) {
  gradientBg(c, ['#1B1050', '#5B2A86', '#C2410C'], 0.8 + t * 0.1);
  stars(c, t, 50, 0.6);
  const k = ease.back(seg(p, 0, 0.4));
  c.save();
  c.translate(STORY_W / 2, STORY_H * 0.38);
  c.scale(k, k);
  logoArch(c, 0, 0, 200);
  c.restore();
  c.globalAlpha = ease.out(seg(p, 0.2, 0.5));
  centerText(c, 'ROAM', STORY_H * 0.52, 96, '#fff', 900);
  centerText(c, data.title, STORY_H * 0.59, 40, '#fff', 700);
  centerText(c, 'Every journey has a story ✨', STORY_H * 0.66, 34, 'rgba(255,255,255,0.85)', 600);
  c.globalAlpha = ease.out(seg(p, 0.45, 0.75));
  centerText(c, 'Made with ROAM 2.0', STORY_H - 140, 30, 'rgba(255,255,255,0.75)', 700);
  c.globalAlpha = 1;
}

function drawFrame(x: Ctx2, shots: Shot[], prevIdx: { i: number }) {
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
    x.c.fillStyle = '#fff';
    x.c.textAlign = 'right';
    x.c.textBaseline = 'alphabetic';
    x.c.fillText('ROAM ✦', STORY_W - 34, shot.kind === 'memory' ? 92 : 70);
    x.c.globalAlpha = 1;
  }
  // transition flash between shots
  const edge = Math.min(x.t - shot.start, shot.start + shot.duration - x.t);
  if (edge < 0.15 && shot.kind !== 'memory') {
    x.c.fillStyle = `rgba(0,0,0,${0.5 * (1 - edge / 0.15)})`;
    x.c.fillRect(0, 0, STORY_W, STORY_H);
  }
}

// ---------------- render ----------------

/** Draw one frame at time `t` (used for the live preview/poster). */
export function renderStoryFrame(canvas: HTMLCanvasElement, data: StoryData, template: StoryTemplate, t: number) {
  const { shots } = buildStoryTimeline(data.memories, template);
  const c = canvas.getContext('2d')!;
  drawFrame({ c, data, assets: new Map(), t }, shots, { i: -1 });
}

export async function renderStoryVideo(data: StoryData, opts: ExportOptions): Promise<StoryVideoResult> {
  if (!canExportStoryVideo()) throw new Error('Video export is not supported in this browser. Try Chrome, Edge, Safari or Firefox.');
  const { shots, duration } = buildStoryTimeline(data.memories, opts.template);
  const progress = opts.onProgress ?? (() => {});

  // 1. load photos & videos used in the story
  progress(0, 'Collecting your photos & videos…');
  const memoryShots = shots.filter((s): s is Extract<Shot, { kind: 'memory' }> => s.kind === 'memory');
  const assets = new Map<number, Asset>();
  let loaded = 0;
  await Promise.all(
    memoryShots.map(async (s) => {
      const a = s.memory.url ? await (s.memory.isVideo ? loadVideo(s.memory.url) : loadImage(s.memory.url)) : null;
      assets.set(s.index, a);
      progress((++loaded / Math.max(1, memoryShots.length)) * 8, 'Collecting your photos & videos…');
    }),
  );

  // 2. canvas + audio graph
  const canvas = document.createElement('canvas');
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const c = canvas.getContext('2d')!;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audio = opts.track !== 'none' && AC ? new AC() : null;
  const dest = audio?.createMediaStreamDestination() ?? null;
  const videoStream = canvas.captureStream(FPS);
  const tracks = [...videoStream.getVideoTracks(), ...(dest?.stream.getAudioTracks() ?? [])];
  const stream = new MediaStream(tracks);
  const { mime, ext } = pickMimeType();
  const recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((r) => (recorder.onstop = () => r()));

  // draw first frame before recording starts
  const x: Ctx2 = { c, data, assets, t: 0 };
  const prevIdx = { i: -1 };
  drawFrame(x, shots, prevIdx);

  if (audio) await audio.resume();
  recorder.start(250);
  const music = audio && dest ? scheduleMusic(audio, opts.track, duration, opts.monitorAudio ? [dest, audio.destination] : [dest]) : null;
  const t0 = performance.now();

  // 3. real-time render loop (MediaRecorder records wall-clock time)
  await new Promise<void>((resolve) => {
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
  });

  // 4. finish
  progress(99, 'Finishing video…');
  await new Promise((r) => setTimeout(r, 300));
  recorder.stop();
  await stopped;
  music?.stop();
  tracks.forEach((tr) => tr.stop());
  assets.forEach((a) => a?.kind === 'video' && a.el.pause());
  await audio?.close().catch(() => {});

  const type = (mime || chunks[0]?.type || `video/${ext}`).split(';')[0];
  const blob = new Blob(chunks, { type });
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
  };
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
