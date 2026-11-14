import * as ImagePicker from 'expo-image-picker';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { Platform } from 'react-native';

import { storage } from '../lib/firebase';
import { MAX_VIDEO_SECONDS, normalizePickerDurationMs, videoLengthError } from '../logic/media';
import { randomId } from './util';
import { probeVideoDurationMs } from './videoProbe';

export interface PickedMedia {
  uri: string;
  type: 'image' | 'video';
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number | null;
  sizeBytes?: number | null;
}

/** Open the integrated camera or the library (BRD §7). Returns null if cancelled/denied. */
export async function pickMedia(source: 'camera' | 'library', kinds: 'images' | 'all' = 'all'): Promise<PickedMedia | null> {
  const mediaTypes: ImagePicker.MediaType[] = kinds === 'images' ? ['images'] : ['images', 'videos'];
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera permission is required to capture moments.');
    // Camera stops recording at the limit
    result = await ImagePicker.launchCameraAsync({ mediaTypes, quality: 0.8, videoMaxDuration: MAX_VIDEO_SECONDS });
  } else {
    result = await ImagePicker.launchImageLibraryAsync({ mediaTypes, quality: 0.8, allowsMultipleSelection: false, videoMaxDuration: MAX_VIDEO_SECONDS });
  }
  if (result.canceled || !result.assets?.length) return null;
  const a = result.assets[0];
  const type = a.type === 'video' ? 'video' : 'image';
  let durationMs: number | null = null;
  if (type === 'video') {
    // Videos are limited to 30 seconds. The picker reports seconds on web and ms on
    // native; if it can't tell, measure the file itself.
    durationMs = normalizePickerDurationMs(a.duration, Platform.OS) ?? (await probeVideoDurationMs(a.uri));
    const problem = videoLengthError(durationMs, a.fileSize ?? null);
    if (problem) throw new Error(problem);
  }
  return {
    uri: a.uri,
    type,
    mimeType: a.mimeType ?? (type === 'video' ? 'video/mp4' : 'image/jpeg'),
    width: a.width,
    height: a.height,
    durationMs,
    sizeBytes: a.fileSize ?? null,
  };
}

/**
 * Resumable upload with retry (BRD §16.1 / §16.5). Large media is uploaded in
 * chunks by the SDK; transient failures are retried with exponential backoff.
 */
export async function uploadMedia(
  uid: string,
  media: { uri: string; mimeType: string; durationMs?: number | null },
  folder: 'media' | 'avatars' | 'receipts' = 'media',
  onProgress?: (pct: number) => void,
  attempts = 3,
): Promise<string> {
  const isVideo = media.mimeType.startsWith('video/');
  if (isVideo) {
    const problem = videoLengthError(media.durationMs ?? null);
    if (problem) throw new Error(problem);
  }
  const blob = await (await fetch(media.uri)).blob();
  // storage.rules require the clip length for videos (≤ 30 s)
  const customMetadata = isVideo ? { durationMs: String(Math.round(media.durationMs!)) } : undefined;
  const ext = media.mimeType.split('/')[1]?.split(';')[0] || 'bin';
  const path = `${folder}/${uid}/${randomId()}.${ext}`;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const task = uploadBytesResumable(ref(storage, path), blob, { contentType: media.mimeType, customMetadata });
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (s) => onProgress?.(s.totalBytes ? (s.bytesTransferred / s.totalBytes) * 100 : 0),
          reject,
          () => resolve(),
        );
      });
      return await getDownloadURL(task.snapshot.ref);
    } catch (e) {
      lastErr = e;
      // Rejected by the server (rules/limits): retrying won't help
      if ((e as { code?: string }).code === 'storage/unauthorized') break;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr;
}
