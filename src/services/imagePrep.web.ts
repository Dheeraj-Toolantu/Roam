/**
 * Shrinks large phone photos before upload (web). Android camera photos are often
 * 6–12 MB / 4000 px — slow on mobile data and over the 5 MB avatar limit.
 * Formats the browser can't decode (e.g. HEIC on Chrome) are uploaded unchanged.
 */
export async function prepareImageForUpload(file: Blob, mimeType: string, maxSide: number): Promise<{ blob: Blob; mimeType: string }> {
  if (!mimeType.startsWith('image/') || mimeType === 'image/gif' || typeof document === 'undefined') return { blob: file, mimeType };
  let img: ImageBitmap | HTMLImageElement;
  let url: string | null = null;
  try {
    if (typeof createImageBitmap === 'function') img = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    else {
      url = URL.createObjectURL(file);
      img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url!;
      });
    }
  } catch {
    if (url) URL.revokeObjectURL(url);
    return { blob: file, mimeType };
  }
  const w = img.width;
  const h = img.height;
  const k = Math.min(1, maxSide / Math.max(w, h));
  if (k === 1 && file.size < 1.5 * 1024 * 1024) {
    if (url) URL.revokeObjectURL(url);
    return { blob: file, mimeType };
  }
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * k));
  cv.height = Math.max(1, Math.round(h * k));
  const c = cv.getContext('2d')!;
  c.fillStyle = '#fff'; // flatten transparency for JPEG
  c.fillRect(0, 0, cv.width, cv.height);
  c.drawImage(img, 0, 0, cv.width, cv.height);
  if ('close' in img) img.close();
  if (url) URL.revokeObjectURL(url);
  const out = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/jpeg', 0.85));
  if (!out || out.size >= file.size) return { blob: file, mimeType };
  return { blob: out, mimeType: 'image/jpeg' };
}
