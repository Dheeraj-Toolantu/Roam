import * as VideoThumbnails from 'expo-video-thumbnails';

/**
 * A JPEG still from a local video (a little way in, so it isn't a black fade-in frame).
 * Returns a local file URI, or null if the clip can't be decoded — a thumbnail must never block a post.
 */
export async function makeVideoThumbnail(uri: string, durationMs?: number | null): Promise<{ uri: string; mimeType: string } | null> {
  try {
    const time = Math.min(1000, Math.max(0, (durationMs ?? 2000) / 4));
    const t = await VideoThumbnails.getThumbnailAsync(uri, { time, quality: 0.7 });
    return { uri: t.uri, mimeType: 'image/jpeg' };
  } catch {
    return null;
  }
}
