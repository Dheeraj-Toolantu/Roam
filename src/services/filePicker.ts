import type { PickedMedia } from './media';

/** Native apps use expo-image-picker (see media.ts); this is only used on web. */
export async function pickFileWeb(_source: 'camera' | 'library', _kinds: 'images' | 'all'): Promise<PickedMedia | null> {
  return null;
}
