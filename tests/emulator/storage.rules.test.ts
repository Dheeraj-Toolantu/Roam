/**
 * Cloud Storage security rules tests (storage.rules) against the Storage emulator.
 */
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-roam-storage',
    storage: { rules: readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});
afterAll(async () => env?.cleanup());

const as = (uid: string) => env.authenticatedContext(uid).storage();
const anon = () => env.unauthenticatedContext().storage();
const bytes = (n: number) => new Uint8Array(n).fill(7);
const IMG = { contentType: 'image/jpeg' };
const VID = { contentType: 'video/mp4', customMetadata: { durationMs: '12000' } };
const vid = (durationMs?: string) => ({ contentType: 'video/mp4', ...(durationMs !== undefined ? { customMetadata: { durationMs } } : {}) });

describe('storage.rules', () => {
  it('users upload photos & videos only into their own media folder', async () => {
    await assertSucceeds(uploadBytes(ref(as('alice'), 'media/alice/a.jpg'), bytes(1000), IMG));
    await assertSucceeds(uploadBytes(ref(as('alice'), 'media/alice/clip.mp4'), bytes(1000), VID));
    await assertFails(uploadBytes(ref(as('bob'), 'media/alice/evil.jpg'), bytes(1000), IMG));
    await assertFails(uploadBytes(ref(anon(), 'media/alice/x.jpg'), bytes(1000), IMG));
  });

  it('videos: max 30 seconds, length must be declared', async () => {
    await assertSucceeds(uploadBytes(ref(as('alice'), 'media/alice/ok.mp4'), bytes(1000), vid('29900')));
    await assertSucceeds(uploadBytes(ref(as('alice'), 'media/alice/edge.mp4'), bytes(1000), vid('30400')));
    await assertFails(uploadBytes(ref(as('alice'), 'media/alice/long.mp4'), bytes(1000), vid('45000')));
    await assertFails(uploadBytes(ref(as('alice'), 'media/alice/nolen.mp4'), bytes(1000), vid()));
    await assertFails(uploadBytes(ref(as('alice'), 'media/alice/bad.mp4'), bytes(1000), vid('abc')));
    await assertFails(uploadBytes(ref(as('alice'), 'receipts/alice/r.mp4'), bytes(1000), vid('5000')));
  });

  it('ROAM story videos: own folder, video only, up to ~1 minute declared', async () => {
    await assertSucceeds(uploadBytes(ref(as('alice'), 'stories/alice/s.mp4'), bytes(1000), vid('60000')));
    await assertSucceeds(uploadBytes(ref(as('alice'), 'stories/alice/s.webm'), bytes(1000), { contentType: 'video/webm', customMetadata: { durationMs: '15000' } }));
    await assertFails(uploadBytes(ref(as('alice'), 'stories/alice/long.mp4'), bytes(1000), vid('70001')));
    await assertFails(uploadBytes(ref(as('alice'), 'stories/alice/nolen.mp4'), bytes(1000), vid()));
    await assertFails(uploadBytes(ref(as('alice'), 'stories/alice/x.jpg'), bytes(1000), { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(as('bob'), 'stories/alice/s.mp4'), bytes(1000), vid('20000')));
  });

  it('rejects non-media files', async () => {
    await assertFails(uploadBytes(ref(as('alice'), 'media/alice/a.exe'), bytes(100), { contentType: 'application/octet-stream' }));
    await assertFails(uploadBytes(ref(as('alice'), 'media/alice/a.html'), bytes(100), { contentType: 'text/html' }));
  });

  it('avatars: images only, max 5 MB, own folder', async () => {
    await assertSucceeds(uploadBytes(ref(as('alice'), 'avatars/alice/me.png'), bytes(2000), { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(as('alice'), 'avatars/alice/me.mp4'), bytes(2000), VID));
    await assertFails(uploadBytes(ref(as('alice'), 'avatars/alice/big.png'), bytes(5 * 1024 * 1024 + 1), { contentType: 'image/png' }));
    await assertFails(uploadBytes(ref(as('bob'), 'avatars/alice/me.png'), bytes(10), { contentType: 'image/png' }));
  });

  it('receipts: own folder only', async () => {
    await assertSucceeds(uploadBytes(ref(as('alice'), 'receipts/alice/r.jpg'), bytes(500), IMG));
    await assertFails(uploadBytes(ref(as('bob'), 'receipts/alice/r2.jpg'), bytes(500), IMG));
  });

  it('signed-in users can read media; anonymous visitors cannot list/read via the SDK', async () => {
    await assertSucceeds(getBytes(ref(as('bob'), 'media/alice/a.jpg')));
    await assertFails(getBytes(ref(anon(), 'media/alice/a.jpg')));
  });

  it('only the owner can delete their files; nothing outside known folders is writable', async () => {
    await assertFails(deleteObject(ref(as('bob'), 'media/alice/a.jpg')));
    await assertSucceeds(deleteObject(ref(as('alice'), 'media/alice/a.jpg')));
    await assertFails(uploadBytes(ref(as('alice'), 'public/anything.jpg'), bytes(10), IMG));
    await assertFails(uploadBytes(ref(as('alice'), 'alice.jpg'), bytes(10), IMG));
  });
});
