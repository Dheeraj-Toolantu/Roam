import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';

import type { TrackId } from '../logic/musicScore';
import { STORY_LENGTHS, STORY_STYLES, type StoryStyle, type StoryTemplate } from '../logic/storyTimeline';
import { stopPreviewMusic } from '../lib/musicPlayer';
import {
  canExportStoryVideo,
  canShareFiles,
  downloadStoryVideo,
  firstMemoryTime,
  renderStoryFrame,
  renderStoryVideo,
  shareStoryVideo,
  type StoryData,
  type StoryVideoResult,
} from '../services/storyVideo';
import { colors, gradients, radius, type } from '../theme';
import { Confetti, IconBadge, PressScale, tap } from './motion';
import { Button, Card, Chip, ErrorText, InfoText, ProgressBar, Row } from './ui';

const APP_URL = 'https://jododeal-b845b.web.app';

/**
 * "Create story video" — renders the trip into a shareable 9:16 video with music,
 * then shares it to WhatsApp / Facebook / Instagram via the system share sheet.
 */
export function StoryVideoExporter({
  data,
  track,
  autoFocus,
  onCreated,
  onPost,
  postLabel = 'Post video to my feed',
}: {
  data: StoryData;
  track: TrackId;
  autoFocus?: boolean;
  onCreated?: (r: StoryVideoResult, template: StoryTemplate) => void;
  /** Upload the rendered video and post it (feed / crew). Reports upload progress 0–100. */
  onPost?: (r: StoryVideoResult, onProgress: (pct: number) => void) => Promise<void>;
  postLabel?: string;
}) {
  const [template, setTemplate] = useState<StoryTemplate>('reel');
  const [style, setStyle] = useState<StoryStyle>('classic');
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [stage, setStage] = useState('');
  const [result, setResult] = useState<StoryVideoResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [posting, setPosting] = useState<number | null>(null);
  const [posted, setPosted] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const supported = canExportStoryVideo();

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  const create = async () => {
    setErr(null);
    setInfo(null);
    setBusy(true);
    setPct(0);
    stopPreviewMusic();
    tap('medium');
    try {
      const r = await renderStoryVideo(data, {
        template,
        style,
        track,
        monitorAudio: true,
        onProgress: (p, s) => {
          setPct(p);
          setStage(s);
        },
      });
      if (result) URL.revokeObjectURL(result.url);
      setResult(r);
      setPosted(false);
      tap('success');
      onCreated?.(r, template);
    } catch (e) {
      setErr((e as Error).message || 'Could not create the video.');
    } finally {
      setBusy(false);
    }
  };

  const post = async () => {
    if (!result || !onPost) return;
    setErr(null);
    setPosting(0);
    try {
      await onPost(result, setPosting);
      setPosted(true);
      setInfo('Posted! Your story video now plays in the travel feed.');
    } catch (e) {
      setErr((e as Error).message || 'Could not post the video.');
    } finally {
      setPosting(null);
    }
  };

  const share = async () => {
    if (!result) return;
    setErr(null);
    const out = await shareStoryVideo(result, data.title).catch((e) => {
      setErr((e as Error).message);
      return null;
    });
    if (out === 'downloaded')
      setInfo('Video saved to your device. Open WhatsApp or Facebook and attach it to a chat, Status or Story.');
  };

  if (!supported) {
    return <InfoText text="Your browser can't record videos. Open ROAM in Chrome, Edge, Safari or Firefox to create a shareable story video." />;
  }

  return (
    <Card style={{ marginTop: 18, borderColor: autoFocus ? colors.violet : colors.cardBorder, borderWidth: autoFocus ? 2 : 1 }} testID="story-exporter">
      <Row gap={12} style={{ marginBottom: 12 }}>
        <IconBadge icon="film" gradient="candy" size={46} float={!result} />
        <View style={{ flex: 1 }}>
          <Text style={type.h3}>{result ? 'Your story video is ready! 🎉' : 'Create your story video 🎬'}</Text>
          <Text style={type.small}>All your trip photos & videos, the route and music — ready for WhatsApp & Facebook.</Text>
        </View>
      </Row>

      {!result && !busy && (
        <>
          <Text style={[type.small, { fontWeight: '800', marginBottom: 8 }]}>Length</Text>
          <Row style={{ flexWrap: 'wrap', marginBottom: 12 }}>
            {STORY_LENGTHS.map((l) => (
              <Chip key={l.id} label={l.label} icon={l.icon} active={template === l.id} onPress={() => setTemplate(l.id)} testID={`export-${l.id}`} />
            ))}
          </Row>
          <Text style={[type.small, { fontWeight: '800', marginBottom: 8 }]}>Style</Text>
          <StylePicker data={data} template={template} value={style} onChange={setStyle} />
          <PressScale onPress={create} testID="create-story-video" accessibilityRole="button" accessibilityLabel="Create story video" scaleTo={0.96}>
            <LinearGradient colors={gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 }}>
              <Ionicons name="sparkles" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17 }}>Create story video</Text>
            </LinearGradient>
          </PressScale>
          <Text style={[type.tiny, { marginTop: 8, textAlign: 'center' }]}>
            Takes about {template === 'short' ? '15 seconds' : template === 'reel' ? '30 seconds' : '1 minute'} — keep this tab open. You&apos;ll hear the soundtrack while it records.
          </Text>
        </>
      )}

      {busy && (
        <View style={{ gap: 8 }} testID="story-progress">
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={type.small}>{stage}</Text>
            <Text style={{ color: colors.cyan, fontWeight: '800' }}>{Math.round(pct)}%</Text>
          </Row>
          <ProgressBar pct={pct} color={colors.pink} height={10} />
        </View>
      )}

      {result && (
        <View style={{ gap: 12 }}>
          <View style={{ alignItems: 'center' }}>
            <video
              ref={videoRef}
              src={result.url}
              controls
              playsInline
              data-testid="story-video"
              data-mime={result.mimeType}
              data-bytes={result.blob.size}
              data-duration={result.durationSec}
              data-has-audio={result.hasAudio ? '1' : '0'}
              data-media-total={result.media.total}
              data-media-loaded={result.media.loaded}
              data-videos={result.media.videos}
              data-videos-loaded={result.media.videosLoaded}
              data-style={result.style}
              style={{ width: 240, aspectRatio: '9 / 16', borderRadius: 18, background: '#000' }}
            />
          </View>
          <Text style={[type.tiny, { textAlign: 'center' }]} testID="story-meta">
            {result.width}×{result.height} · {Math.round(result.durationSec)}s · {(result.blob.size / 1024 / 1024).toFixed(1)} MB · {result.mimeType.includes('mp4') ? 'MP4' : 'WebM'}
            {result.hasAudio ? ' · with music' : ''}
          </Text>
          {result.media.total > 0 && (
            <Text style={[type.tiny, { textAlign: 'center', color: result.media.loaded < result.media.total ? colors.yellow : colors.green }]} testID="story-media">
              {result.media.loaded}/{result.media.total} photos & videos included
              {result.media.loaded < result.media.total
                ? ` — ${result.media.total - result.media.loaded} couldn't be read by this browser${result.media.videos > result.media.videosLoaded ? ' (iPhone HEVC clips play best in Safari)' : ''}`
                : ' ✓'}
            </Text>
          )}
          {onPost && (
            <View style={{ gap: 6 }}>
              <Button
                testID="post-story-video"
                title={posted ? 'Posted to the feed ✓' : posting != null ? `Uploading… ${Math.round(posting)}%` : postLabel}
                icon={posted ? 'checkmark-circle' : 'paper-plane'}
                variant="primary"
                onPress={post}
                loading={posting != null}
                disabled={posted}
              />
              {posting != null && <ProgressBar pct={posting} />}
            </View>
          )}
          <Button testID="share-story" title={canShareFiles(result) ? 'Share to WhatsApp, Facebook…' : 'Download & share'} icon="share-social" variant={onPost ? 'secondary' : 'primary'} onPress={share} />
          <Row>
            <Button
              small
              style={{ flex: 1 }}
              variant="success"
              icon="logo-whatsapp"
              title="WhatsApp"
              testID="share-whatsapp"
              onPress={async () => {
                if (canShareFiles(result)) return share();
                downloadStoryVideo(result);
                setInfo('Video saved — attach it in WhatsApp (chat or Status).');
                await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`${data.title} ✨ made with ROAM ${APP_URL}`)}`).catch(() => {});
              }}
            />
            <Button
              small
              style={{ flex: 1 }}
              variant="secondary"
              icon="logo-facebook"
              title="Facebook"
              testID="share-facebook"
              onPress={async () => {
                if (canShareFiles(result)) return share();
                downloadStoryVideo(result);
                setInfo('Video saved — upload it to a Facebook post, Story or Reel.');
                await Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(APP_URL)}`).catch(() => {});
              }}
            />
          </Row>
          <Row>
            <Button small style={{ flex: 1 }} variant="ghost" icon="download-outline" title="Download" testID="download-story" onPress={() => downloadStoryVideo(result)} />
            <Button
              small
              style={{ flex: 1 }}
              variant="ghost"
              icon="refresh"
              title="Make another"
              onPress={() => {
                URL.revokeObjectURL(result.url);
                setResult(null);
                setPosted(false);
              }}
            />
          </Row>
        </View>
      )}
      {!!info && <InfoText text={info} icon="checkmark-circle" />}
      <ErrorText text={err} />
      <Confetti fire={result ? result.blob.size : 0} />
    </Card>
  );
}

/** Style options with a live thumbnail of each look. */
function StylePicker({ data, template, value, onChange }: { data: StoryData; template: StoryTemplate; value: StoryStyle; onChange: (s: StoryStyle) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
      {STORY_STYLES.map((st) => (
        <PressScale
          key={st.id}
          onPress={() => onChange(st.id)}
          testID={`style-${st.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${st.label} style`}
          accessibilityState={{ selected: value === st.id }}
          scaleTo={0.94}
          style={{ width: '31%' }}>
          <View style={{ borderRadius: 14, borderWidth: 2, borderColor: value === st.id ? colors.pink : colors.cardBorder, overflow: 'hidden', backgroundColor: '#000' }}>
            <StyleThumb data={data} template={template} style={st.id} />
            <View style={{ padding: 6, backgroundColor: value === st.id ? colors.pink + '33' : colors.card }}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }} numberOfLines={1}>
                {st.emoji} {st.label}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 10 }} numberOfLines={1}>
                {st.vibe}
              </Text>
            </View>
          </View>
        </PressScale>
      ))}
    </View>
  );
}

function StyleThumb({ data, template, style }: { data: StoryData; template: StoryTemplate; style: StoryStyle }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      renderStoryFrame(ref.current, data, template, firstMemoryTime(data, template), style);
    } catch {
      /* preview only */
    }
  }, [data, template, style]);
  return <canvas ref={ref} width={144} height={256} style={{ width: '100%', aspectRatio: '9 / 16', display: 'block' }} />;
}
