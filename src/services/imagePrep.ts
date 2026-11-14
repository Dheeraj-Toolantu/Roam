/** Native: expo-image-picker already compresses (quality 0.8); upload as-is. */
export async function prepareImageForUpload(file: Blob, mimeType: string, _maxSide: number): Promise<{ blob: Blob; mimeType: string }> {
  return { blob: file, mimeType };
}
