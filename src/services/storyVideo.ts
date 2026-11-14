/**
 * Native placeholder for story video export. The iOS/Android apps play the story
 * in-app (ROAM Magic); exporting a video file on device needs a native encoder or the
 * server render pipeline (FFmpeg on Cloud Run), planned once the backend is on Blaze.
 * The web implementation lives in storyVideo.web.ts.
 */
import type { TrackId } from '../logic/musicScore';
import type { StoryMemory, StoryTemplate } from '../logic/storyTimeline';

export const STORY_W = 720;
export const STORY_H = 1280;

export interface StoryData {
  title: string;
  subtitle: string;
  cityName: string | null;
  cityEmoji: string | null;
  colors: [string, string];
  country: string | null;
  route: { lat: number; lng: number }[];
  places: { lat: number; lng: number; label?: string }[];
  memories: StoryMemory[];
  stats: { label: string; value: string }[];
}

export interface StoryVideoResult {
  blob: Blob;
  url: string;
  mimeType: string;
  fileName: string;
  durationSec: number;
  hasAudio: boolean;
  width: number;
  height: number;
}

export interface ExportOptions {
  template: StoryTemplate;
  track: TrackId;
  onProgress?: (pct: number, stage: string) => void;
  monitorAudio?: boolean;
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

export function canExportStoryVideo(): boolean {
  return false;
}
export function canShareFiles(_res: StoryVideoResult): boolean {
  return false;
}
export async function renderStoryVideo(_data: StoryData, _opts: ExportOptions): Promise<StoryVideoResult> {
  throw new Error('Story video export is available in the ROAM web app for now.');
}
export async function shareStoryVideo(_res: StoryVideoResult, _title: string): Promise<ShareOutcome> {
  throw new Error('Story video export is available in the ROAM web app for now.');
}
export function downloadStoryVideo(_res: StoryVideoResult) {}
