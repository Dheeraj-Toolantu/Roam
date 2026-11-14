import * as ImagePicker from 'expo-image-picker';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';

import { storage } from '../lib/firebase';
import { randomId } from './util';

export interface PickedMedia {
  uri: string;
  type: 'image' | 'video';
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number | null;
}

/** Open the integrated camera or the library (BRD §7). Returns null if cancelled/denied. */
export async function pickMedia(source: 'camera' | 'library', kinds: 'images' | 'all' = 'all'): Promise<PickedMedia | null> {
  const mediaTypes: ImagePicker.MediaType[] = kinds === 'images' ? ['images'] : ['images', 'videos'];
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera permission is required to capture moments.');
    result = await ImagePicker.launchCameraAsync({ mediaTypes, quality: 0.8, videoMaxDuration: 60 });
  } else {
    result = await ImagePicker.launchImageLibraryAsync({ mediaTypes, quality: 0.8, allowsMultipleSelection: false });
  }
  if (result.canceled || !result.assets?.length) return null;
  const a = result.assets[0];
  const type = a.type === 'video' ? 'video' : 'image';
  return {
    uri: a.uri,
    type,
    mimeType: a.mimeType ?? (type === 'video' ? 'video/mp4' : 'image/jpeg'),
    width: a.width,
    height: a.height,
    durationMs: a.duration ?? null,
  };
}

/**
 * Resumable upload with retry (BRD §16.1 / §16.5). Large media is uploaded in
 * chunks by the SDK; transient failures are retried with exponential backoff.
 */
export async function uploadMedia(
  uid: string,
  media: { uri: string; mimeType: string },
  folder: 'media' | 'avatars' | 'receipts' = 'media',
  onProgress?: (pct: number) => void,
  attempts = 3,
): Promise<string> {
  const blob = await (await fetch(media.uri)).blob();
  const ext = media.mimeType.split('/')[1]?.split(';')[0] || 'bin';
  const path = `${folder}/${uid}/${randomId()}.${ext}`;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const task = uploadBytesResumable(ref(storage, path), blob, { contentType: media.mimeType });
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
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr;
}
