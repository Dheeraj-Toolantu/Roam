/** Media upload limits (pure; unit tested in tests/unit/media.test.ts). */

export const MAX_VIDEO_SECONDS = 30;
export const MAX_VIDEO_MS = MAX_VIDEO_SECONDS * 1000;
/** Small allowance for container rounding (a "30 s" clip is often 30.03 s). */
export const VIDEO_TOLERANCE_MS = 500;
/** Must match storage.rules. */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/**
 * expo-image-picker reports `duration` in milliseconds on iOS/Android but in
 * **seconds** on web (and 0 when it can't read it). Normalise to ms, or null if unknown.
 */
export function normalizePickerDurationMs(raw: number | null | undefined, platform: string): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  return platform === 'web' ? Math.round(raw * 1000) : Math.round(raw);
}

export function formatClipLength(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Returns a user-facing error if the clip can't be uploaded, else null. */
export function videoLengthError(durationMs: number | null, sizeBytes?: number | null): string | null {
  if (durationMs == null) return `We couldn't read this video's length. Please choose another video (max ${MAX_VIDEO_SECONDS} seconds).`;
  if (durationMs > MAX_VIDEO_MS + VIDEO_TOLERANCE_MS) {
    return `This video is ${formatClipLength(durationMs)} long. Videos can be up to ${MAX_VIDEO_SECONDS} seconds — please trim it and try again.`;
  }
  if (sizeBytes != null && sizeBytes > MAX_VIDEO_BYTES) return 'This video file is too large (max 100 MB). Try recording at a lower quality.';
  return null;
}
