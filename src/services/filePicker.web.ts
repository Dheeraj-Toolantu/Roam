/**
 * Web photo/video picker (used instead of expo-image-picker's web version).
 *
 * Works around Android browser quirks: files with an empty/generic MIME type, HEVC
 * clips the browser can't decode (length read from the MP4/MOV header instead), and
 * the camera `capture` attribute. The input is opened synchronously inside the tap.
 */
import { MAX_VIDEO_BYTES, videoLengthError } from '../logic/media';
import { inferMimeType, parseMp4DurationMs } from '../logic/mediaType';
import type { PickedMedia } from './media';
import { probeVideoDurationMs } from './videoProbe';

const IMAGE_ACCEPT = 'image/*,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif';
const VIDEO_ACCEPT = 'video/*,.mp4,.mov,.m4v,.3gp,.webm,.mkv';

export function pickFileWeb(source: 'camera' | 'library', kinds: 'images' | 'all'): Promise<PickedMedia | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = kinds === 'images' ? IMAGE_ACCEPT : `${IMAGE_ACCEPT},${VIDEO_ACCEPT}`;
    if (source === 'camera') input.setAttribute('capture', 'environment');
    input.setAttribute('data-testid', 'file-input');
    Object.assign(input.style, { position: 'fixed', left: '-1000px', top: '0', opacity: '0' });
    document.body.appendChild(input);
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      setTimeout(() => input.remove(), 0);
      fn();
    };
    input.addEventListener('cancel', () => finish(() => resolve(null)));
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return finish(() => resolve(null));
      describeFile(file, kinds).then(
        (m) => finish(() => resolve(m)),
        (e) => finish(() => reject(e)),
      );
    });
    input.click();
  });
}

async function readSlice(file: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

/** Turn a chosen file into PickedMedia (type, size, video length), or throw a friendly error. */
export async function describeFile(file: File, kinds: 'images' | 'all' = 'all'): Promise<PickedMedia> {
  const head = await readSlice(file, 0, 64).catch(() => null);
  const mimeType = inferMimeType(file.name, file.type, head);
  if (!mimeType) throw new Error('Please choose a photo or a video.');
  const isVideo = mimeType.startsWith('video/');
  if (isVideo && kinds === 'images') throw new Error('Please choose a photo.');
  if (!isVideo && file.size > 25 * 1024 * 1024) throw new Error('This photo is too large (max 25 MB).');
  if (isVideo && file.size > MAX_VIDEO_BYTES) throw new Error('This video file is too large (max 100 MB). Try recording at a lower quality.');
  const uri = URL.createObjectURL(file);
  let durationMs: number | null = null;
  if (isVideo) {
    durationMs = await videoDurationMs(file, uri);
    const problem = videoLengthError(durationMs, file.size);
    if (problem) {
      URL.revokeObjectURL(uri);
      throw new Error(problem);
    }
  }
  return { uri, type: isVideo ? 'video' : 'image', mimeType, durationMs, sizeBytes: file.size, file };
}

/** Length from the container header first (works for codecs the browser can't play), then by decoding. */
async function videoDurationMs(file: File, uri: string): Promise<number | null> {
  const CHUNK = 4 * 1024 * 1024;
  try {
    const fromHead = parseMp4DurationMs(await readSlice(file, 0, Math.min(file.size, CHUNK)));
    if (fromHead) return fromHead;
    if (file.size > CHUNK) {
      const fromTail = parseMp4DurationMs(await readSlice(file, Math.max(0, file.size - CHUNK), file.size));
      if (fromTail) return fromTail;
    }
  } catch {
    /* fall through to decoding */
  }
  return probeVideoDurationMs(uri);
}
