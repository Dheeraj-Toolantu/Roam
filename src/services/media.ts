import * as ImagePicker from 'expo-image-picker';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { Platform } from 'react-native';

import { storage } from '../lib/firebase';
import { MAX_VIDEO_SECONDS, normalizePickerDurationMs, videoLengthError } from '../logic/media';
import { extensionFor, inferMimeType } from '../logic/mediaType';
import { pickFileWeb } from './filePicker';
import { prepareImageForUpload } from './imagePrep';
import { randomId } from './util';
import { probeVideoDurationMs } from './videoProbe';
import { makeVideoThumbnail } from './videoThumb';

export interface PickedMedia {
  uri: string;
  type: 'image' | 'video';
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number | null;
  sizeBytes?: number | null;
  /** web: the picked File itself (uploaded directly, no re-fetch) */
  file?: Blob;
}

/** Open the integrated camera or the library (BRD §7). Returns null if cancelled/denied. */
export async function pickMedia(source: 'camera' | 'library', kinds: 'images' | 'all' = 'all'): Promise<PickedMedia | null> {
  // Web (incl. Android/iOS browsers): our own picker — must open synchronously in the tap.
  if (Platform.OS === 'web') return pickFileWeb(source, kinds);
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
  // Android can report a generic/missing MIME type: fall back to the file name.
  const mimeType = inferMimeType(a.fileName ?? a.uri, a.mimeType) ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg');
  const type = a.type === 'video' || mimeType.startsWith('video/') ? 'video' : 'image';
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
    mimeType,
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
  media: { uri: string; mimeType: string; durationMs?: number | null; file?: Blob },
  folder: 'media' | 'avatars' | 'receipts' = 'media',
  onProgress?: (pct: number) => void,
  attempts = 3,
): Promise<string> {
  const isVideo = media.mimeType.startsWith('video/');
  if (isVideo) {
    const problem = videoLengthError(media.durationMs ?? null);
    if (problem) throw new Error(problem);
  }
  let blob = media.file ?? (await uriToBlob(media.uri));
  let contentType = media.mimeType;
  if (!isVideo) ({ blob, mimeType: contentType } = await prepareImageForUpload(blob, contentType, folder === 'avatars' ? 1024 : 2048));
  // storage.rules require the clip length for videos (≤ 30 s)
  const customMetadata = isVideo ? { durationMs: String(Math.round(media.durationMs!)) } : undefined;
  const ext = extensionFor(contentType);
  const path = `${folder}/${uid}/${randomId()}.${ext}`;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const task = uploadBytesResumable(ref(storage, path), blob, { contentType, customMetadata });
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

/**
 * Upload a picked photo/video. Videos also get a JPEG thumbnail (best effort — a clip
 * whose frame can't be decoded is still posted, it just shows a placeholder).
 */
export async function uploadMoment(uid: string, media: PickedMedia, onProgress?: (pct: number) => void): Promise<{ url: string; thumbUrl: string | null }> {
  if (media.type !== 'video') return { url: await uploadMedia(uid, media, 'media', onProgress), thumbUrl: null };
  const thumb = await makeVideoThumbnail(media.uri, media.durationMs);
  const url = await uploadMedia(uid, media, 'media', (p) => onProgress?.(Math.min(95, p * 0.95)));
  let thumbUrl: string | null = null;
  if (thumb) thumbUrl = await uploadMedia(uid, { uri: thumb.uri, mimeType: thumb.mimeType, file: (thumb as { file?: Blob }).file }, 'media').catch(() => null);
  onProgress?.(100);
  return { url, thumbUrl };
}

/**
 * Read a local file URI into a Blob. On Android/iOS, XMLHttpRequest is more reliable than
 * fetch() for file:// and content:// URIs (fetch can fail or hang for gallery files).
 */
function uriToBlob(uri: string): Promise<Blob> {
  if (Platform.OS === 'web') return fetch(uri).then((r) => r.blob());
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new Error("Couldn't read the selected file. Please try again."));
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}
