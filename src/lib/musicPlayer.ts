/**
 * Native: the in-app preview is silent for now (the web build synthesises music
 * with Web Audio — see musicPlayer.web.ts). Kept API-compatible.
 */
import type { TrackId } from '../logic/musicScore';

export function previewMusic(_track: TrackId, _offset: number, _duration: number) {}
export function stopPreviewMusic() {}
