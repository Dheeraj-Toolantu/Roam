/**
 * File-type detection and MP4/MOV duration parsing (pure; unit tested).
 *
 * Android's file chooser (Files, Drive, WhatsApp media, some galleries) often hands the
 * browser files with an empty or generic MIME type, and phones record HEVC clips that the
 * browser can't decode — so we can't rely on `file.type` or a <video> element. These
 * helpers look at the file name and its first bytes instead.
 */

const EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  '3gp': 'video/3gpp',
  '3g2': 'video/3gpp2',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
};

const GENERIC = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/x-unknown']);

const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len));

/** MIME type from the file's first bytes (magic numbers), or null. */
export function sniffMimeType(head: Uint8Array): string | null {
  if (head.length < 12) return null;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head[0] === 0x89 && ascii(head, 1, 3) === 'PNG') return 'image/png';
  if (ascii(head, 0, 4) === 'GIF8') return 'image/gif';
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP') return 'image/webp';
  if (ascii(head, 0, 2) === 'BM') return 'image/bmp';
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'video/webm';
  if (ascii(head, 4, 4) === 'ftyp') {
    const brand = ascii(head, 8, 4).toLowerCase();
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (brand === 'qt  ') return 'video/quicktime';
    if (brand.startsWith('3g2')) return 'video/3gpp2';
    if (brand.startsWith('3gp')) return 'video/3gpp';
    return 'video/mp4'; // isom, mp41, mp42, avc1, M4V, dash, …
  }
  return null;
}

/**
 * Best MIME type for a picked file: a specific declared type wins, then the file's bytes,
 * then its extension. Returns null when it is not a photo or video.
 */
export function inferMimeType(fileName: string | null | undefined, declared: string | null | undefined, head?: Uint8Array | null): string | null {
  const d = (declared ?? '').toLowerCase().split(';')[0].trim();
  if (!GENERIC.has(d) && (d.startsWith('image/') || d.startsWith('video/'))) return d;
  const sniffed = head ? sniffMimeType(head) : null;
  if (sniffed) return sniffed;
  const ext = (fileName ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return (ext && EXT[ext]) || null;
}

/** File extension to store a MIME type under. */
export function extensionFor(mime: string): string {
  const special: Record<string, string> = { 'image/jpeg': 'jpg', 'video/quicktime': 'mov', 'video/3gpp': '3gp', 'video/3gpp2': '3g2', 'video/x-matroska': 'mkv' };
  return special[mime] ?? (mime.split('/')[1]?.split(';')[0].replace(/[^a-z0-9]/gi, '') || 'bin');
}

/**
 * Duration (ms) from an MP4 / MOV / 3GP `mvhd` box found in `bytes` (the start or end of
 * the file — phones write the `moov` index at either end). Null if not found.
 */
export function parseMp4DurationMs(bytes: Uint8Array): number | null {
  for (let i = 4; i + 32 <= bytes.length; i++) {
    // 'mvhd'
    if (bytes[i] !== 0x6d || bytes[i + 1] !== 0x76 || bytes[i + 2] !== 0x68 || bytes[i + 3] !== 0x64) continue;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = bytes[i + 4];
    let timescale: number;
    let duration: number;
    if (version === 1) {
      if (i + 4 + 32 > bytes.length) return null;
      timescale = view.getUint32(i + 4 + 20);
      duration = Number(view.getUint32(i + 4 + 24)) * 2 ** 32 + view.getUint32(i + 4 + 28);
    } else if (version === 0) {
      timescale = view.getUint32(i + 4 + 12);
      duration = view.getUint32(i + 4 + 16);
    } else continue;
    if (!timescale || !Number.isFinite(duration) || duration === 0xffffffff) continue;
    const ms = Math.round((duration / timescale) * 1000);
    if (ms > 0 && ms < 24 * 3600 * 1000) return ms;
  }
  return null;
}
