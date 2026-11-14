import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { nearestCity } from '../logic/journey';
import { addActivity } from '../services/journeys';
import { createPost } from '../services/social';
import { tracker } from '../services/tracker';
import { errorMessage } from '../services/util';
import { colors, type } from '../theme';
import type { Journey, UserProfile, Visibility } from '../types';
import { Button, Card, Chip, ErrorText, Field, Row } from './ui';

/** Add a manual activity (place visited, review or note) to a journey timeline (BRD §6). */
export function ActivityComposer({ journey, me, onDone }: { journey: Journey; me: UserProfile; onDone: () => void }) {
  const [kind, setKind] = useState<'place' | 'review' | 'note'>('place');
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [rating, setRating] = useState(4);
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setErr(null);
    if (!title.trim()) return setErr(kind === 'note' ? 'Write something' : 'Enter the place name');
    setBusy(true);
    try {
      const fix = await tracker.getCurrentPosition();
      const city = fix ? nearestCity(fix) : null;
      await addActivity(journey.id, {
        type: kind,
        title: title.trim(),
        caption: caption.trim(),
        placeName: kind === 'note' ? null : title.trim(),
        city: city?.name ?? journey.cities[journey.cities.length - 1] ?? null,
        rating: kind === 'review' ? rating : null,
        lat: fix?.lat ?? null,
        lng: fix?.lng ?? null,
        visibility,
      });
      if (visibility !== 'private') {
        await createPost(me, {
          text: kind === 'note' ? title.trim() : caption.trim() || `Visited ${title.trim()}`,
          visibility,
          placeName: kind === 'note' ? null : title.trim(),
          city: city?.name ?? journey.cities[journey.cities.length - 1] ?? null,
          journeyId: journey.id,
          groupId: journey.groupId,
          kind: kind === 'review' ? 'review' : 'moment',
          rating: kind === 'review' ? rating : null,
        });
      }
      onDone();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginTop: 12 }}>
      <Row style={{ marginBottom: 12 }}>
        <Chip label="Place" icon="location" active={kind === 'place'} onPress={() => setKind('place')} />
        <Chip label="Review" icon="star" active={kind === 'review'} onPress={() => setKind('review')} />
        <Chip label="Note" icon="create" active={kind === 'note'} onPress={() => setKind('note')} />
      </Row>
      <Field testID="activity-title" placeholder={kind === 'note' ? 'What happened?' : 'Place name, e.g. Fort Aguada'} value={title} onChangeText={setTitle} />
      {kind !== 'note' && <Field placeholder={kind === 'review' ? 'Your review' : 'Caption (optional)'} value={caption} onChangeText={setCaption} multiline />}
      {kind === 'review' && (
        <Row gap={6} style={{ marginBottom: 12 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Pressable key={i} onPress={() => setRating(i)} accessibilityLabel={`${i} stars`}>
              <Ionicons name={i <= rating ? 'star' : 'star-outline'} size={28} color={colors.yellow} />
            </Pressable>
          ))}
        </Row>
      )}
      <Text style={[type.tiny, { marginBottom: 6 }]}>Visibility</Text>
      <Row style={{ flexWrap: 'wrap', marginBottom: 10 }}>
        {(['private', 'followers', ...(journey.groupId ? (['crew'] as const) : []), 'public'] as Visibility[]).map((v) => (
          <Chip key={v} label={v[0].toUpperCase() + v.slice(1)} active={visibility === v} onPress={() => setVisibility(v)} />
        ))}
      </Row>
      <ErrorText text={err} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button small variant="ghost" title="Cancel" onPress={onDone} style={{ flex: 1 }} />
        <Button small testID="activity-save" title="Add to timeline" onPress={save} loading={busy} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}
