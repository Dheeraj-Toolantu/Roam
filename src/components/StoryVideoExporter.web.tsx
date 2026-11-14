import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';

import type { TrackId } from '../logic/musicScore';
import type { StoryTemplate } from '../logic/storyTimeline';
import { stopPreviewMusic } from '../lib/musicPlayer';
import {
  canExportStoryVideo,
  canShareFiles,
  downloadStoryVideo,
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
}: {
  data: StoryData;
  track: TrackId;
  autoFocus?: boolean;
  onCreated?: (r: StoryVideoResult, template: StoryTemplate) => void;
}) {
  const [template, setTemplate] = useState<StoryTemplate>('reel');
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [stage, setStage] = useState('');
  const [result, setResult] = useState<StoryVideoResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
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
        track,
        monitorAudio: true,
        onProgress: (p, s) => {
          setPct(p);
          setStage(s);
        },
      });
      if (result) URL.revokeObjectURL(result.url);
      setResult(r);
      tap('success');
      onCreated?.(r, template);
    } catch (e) {
      setErr((e as Error).message || 'Could not create the video.');
    } finally {
      setBusy(false);
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
          <Row style={{ flexWrap: 'wrap', marginBottom: 12 }}>
            <Chip label="Reel · 30s" icon="phone-portrait" active={template === 'reel'} onPress={() => setTemplate('reel')} testID="export-reel" />
            <Chip label="Cinematic · 1 min" icon="film" active={template === 'cinematic'} onPress={() => setTemplate('cinematic')} testID="export-cinematic" />
          </Row>
          <PressScale onPress={create} testID="create-story-video" accessibilityRole="button" accessibilityLabel="Create story video" scaleTo={0.96}>
            <LinearGradient colors={gradients.sunset} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 }}>
              <Ionicons name="sparkles" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 17 }}>Create story video</Text>
            </LinearGradient>
          </PressScale>
          <Text style={[type.tiny, { marginTop: 8, textAlign: 'center' }]}>
            Takes about {template === 'reel' ? '30 seconds' : '1 minute'} — keep this tab open. You&apos;ll hear the soundtrack while it records.
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
              style={{ width: 240, aspectRatio: '9 / 16', borderRadius: 18, background: '#000' }}
            />
          </View>
          <Text style={[type.tiny, { textAlign: 'center' }]} testID="story-meta">
            {result.width}×{result.height} · {Math.round(result.durationSec)}s · {(result.blob.size / 1024 / 1024).toFixed(1)} MB · {result.mimeType.includes('mp4') ? 'MP4' : 'WebM'}
            {result.hasAudio ? ' · with music' : ''}
          </Text>
          <Button testID="share-story" title={canShareFiles(result) ? 'Share to WhatsApp, Facebook…' : 'Download & share'} icon="share-social" variant="primary" onPress={share} />
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
