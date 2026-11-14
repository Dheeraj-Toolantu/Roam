import type { TrackId } from '../logic/musicScore';
import type { StoryTemplate } from '../logic/storyTimeline';
import type { StoryData, StoryVideoResult } from '../services/storyVideo';
import { InfoText } from './ui';

/**
 * iOS/Android: story preview plays in-app above; exporting a video file on device
 * needs a native encoder or the server render pipeline (planned).
 */
export function StoryVideoExporter(_props: {
  data: StoryData;
  track: TrackId;
  autoFocus?: boolean;
  onCreated?: (r: StoryVideoResult, template: StoryTemplate) => void;
}) {
  return (
    <InfoText text="Shareable story videos (WhatsApp, Facebook) are created in the ROAM web app for now — open jododeal-b845b.web.app in your phone's browser. Native export is coming." />
  );
}
