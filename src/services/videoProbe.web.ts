/**
 * Reads a video file's real duration in the browser (ms), or null if it can't be decoded.
 * Handles files without a duration header (e.g. some WebM recordings report Infinity
 * until seeked to the end).
 */
export function probeVideoDurationMs(uri: string, timeoutMs = 10_000): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    let settled = false;
    const done = (ms: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      v.removeAttribute('src');
      v.load();
      resolve(ms);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    const read = () => (Number.isFinite(v.duration) && v.duration > 0 ? Math.round(v.duration * 1000) : null);
    v.onloadedmetadata = () => {
      const ms = read();
      if (ms != null) return done(ms);
      // Unknown length: seek far past the end so the browser computes it
      v.ondurationchange = () => {
        const d = read();
        if (d != null) done(d);
      };
      v.currentTime = 1e9;
    };
    v.onerror = () => done(null);
    v.src = uri;
  });
}
