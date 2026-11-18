/**
 * Browser version: seek a hidden <video> a little way in, draw the frame on a canvas and
 * export it as a JPEG. Returns null if the browser can't decode the clip (e.g. HEVC on desktop).
 */
export function makeVideoThumbnail(
  uri: string,
  durationMs?: number | null,
  timeoutMs = 10_000,
): Promise<{ uri: string; mimeType: string; file: Blob } | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    let settled = false;
    const done = (r: { uri: string; mimeType: string; file: Blob } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      v.removeAttribute('src');
      v.load();
      resolve(r);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    v.onloadeddata = () => {
      const secs = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : (durationMs ?? 2000) / 1000;
      v.currentTime = Math.min(1, secs / 4);
    };
    v.onseeked = () => {
      try {
        const max = 720;
        const scale = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight || 1));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(v.videoWidth * scale));
        c.height = Math.max(1, Math.round(v.videoHeight * scale));
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
        c.toBlob((b) => done(b ? { uri: URL.createObjectURL(b), mimeType: 'image/jpeg', file: b } : null), 'image/jpeg', 0.75);
      } catch {
        done(null);
      }
    };
    v.onerror = () => done(null);
    v.src = uri;
  });
}
