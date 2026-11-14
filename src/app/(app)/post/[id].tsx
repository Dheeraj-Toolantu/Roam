import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { confirmAsync, PostCard } from '@/components/PostCard';
import { Avatar, Button, Card, Chip, Empty, ErrorText, Field, Header, IconButton, Loading, Row, Screen, SectionTitle, goBackOr } from '@/components/ui';
import { useMe } from '@/lib/session';
import { addComment, deletePost, subscribeComments, subscribePost, updatePost } from '@/services/social';
import { errorMessage, timeAgo } from '@/services/util';
import { colors, space, type } from '@/theme';
import type { Comment, Post, Visibility } from '@/types';

const VIS: { id: Visibility; label: string }[] = [
  { id: 'private', label: 'Only me' },
  { id: 'followers', label: 'Followers' },
  { id: 'public', label: 'Public' },
];

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const [post, setPost] = useState<Post | null | undefined>(undefined);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const a = subscribePost(id, setPost);
    const b = subscribeComments(id, setComments);
    return () => {
      a();
      b();
    };
  }, [id]);

  const send = async () => {
    if (!post || !text.trim()) return;
    setSending(true);
    setError(null);
    try {
      await addComment(post, me, text);
      setText('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    if (!post) return;
    if (!(await confirmAsync('Delete post', 'This post will be permanently removed.', 'Delete'))) return;
    try {
      await deletePost(post.id);
      goBackOr('/');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const changeVis = async (v: Visibility) => {
    if (!post || post.visibility === v) return;
    try {
      await updatePost(post.id, { visibility: v });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const mine = post?.authorId === me.uid;

  return (
    <Screen>
      <Header title="Post" right={mine ? <IconButton icon="trash-outline" color={colors.red} accessibilityLabel="Delete post" onPress={remove} /> : undefined} />
      {post === undefined ? (
        <Loading />
      ) : post === null ? (
        <Empty icon="eye-off-outline" title="Post unavailable" text="It may have been deleted or you no longer have access." />
      ) : (
        <>
          <PostCard post={post} me={me} />
          {mine && post.visibility !== 'crew' && (
            <Card style={{ marginBottom: space.md }}>
              <Text style={[type.small, { marginBottom: 8 }]}>Who can see this post</Text>
              <Row style={{ flexWrap: 'wrap' }}>
                {VIS.map((v) => (
                  <Chip key={v.id} label={v.label} active={post.visibility === v.id} onPress={() => changeVis(v.id)} testID={`post-vis-${v.id}`} />
                ))}
              </Row>
            </Card>
          )}
          <SectionTitle title={`Comments (${comments.length})`} />
          {comments.length === 0 && <Text style={[type.small, { marginBottom: space.md }]}>No comments yet — start the conversation.</Text>}
          {comments.map((c) => (
            <Row key={c.id} style={{ alignItems: 'flex-start', marginBottom: space.md }}>
              <Avatar name={c.authorName} size={32} />
              <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 10 }}>
                <Text style={[type.h3, { fontSize: 13 }]}>
                  {c.authorName} <Text style={type.tiny}>· {timeAgo(c.createdAt)}</Text>
                </Text>
                <Text style={type.body}>{c.text}</Text>
              </View>
            </Row>
          ))}
          <ErrorText text={error} />
          <Row style={{ alignItems: 'flex-start' }}>
            <Field
              style={{ flex: 1, marginBottom: 0 }}
              placeholder="Add a comment…"
              value={text}
              onChangeText={setText}
              maxLength={1000}
              onSubmitEditing={send}
              testID="comment-input"
            />
            <Button title="Send" small onPress={send} loading={sending} disabled={!text.trim()} testID="comment-send" style={{ marginTop: 6 }} />
          </Row>
        </>
      )}
    </Screen>
  );
}
