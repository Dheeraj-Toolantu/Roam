/**
 * Native: the in-app preview is silent for now (the web build synthesises music
 * with Web Audio — see musicPlayer.web.ts). Kept API-compatible.
 */
import type { TrackId } from '../logic/musicScore';

export function previewMusic(_track: TrackId, _offset: number, _duration: number) {}
export function stopPreviewMusic() {}

export type CustomMusic = { name: string; sizeBytes: number };
/** Picking a song from the device is supported in the web app (story videos are exported there). */
export async function pickCustomMusic(): Promise<CustomMusic | null> {
  return null;
}
export function getCustomMusic(): CustomMusic | null {
  return null;
}
export function clearCustomMusic() {}
