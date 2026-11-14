import { describe, expect, it, vi } from 'vitest';

import { isMissingIndexError, sortNewest, withIndexFallback } from '../../src/lib/indexFallback';

// Shape of the error the Firestore client SDK throws when a composite index is missing
const missingIndex = Object.assign(new Error('The query requires an index. You can create it here: https://console.firebase.google.com/...'), {
  code: 'failed-precondition',
});

describe('Firestore missing-index fallback', () => {
  it('recognises only missing-index errors', () => {
    expect(isMissingIndexError(missingIndex)).toBe(true);
    expect(isMissingIndexError(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }))).toBe(false);
    expect(isMissingIndexError(Object.assign(new Error('Document was modified'), { code: 'failed-precondition' }))).toBe(false);
    expect(isMissingIndexError(null)).toBe(false);
  });

  it('uses the indexed query when it works', async () => {
    const fallback = vi.fn(async () => ['slow']);
    await expect(withIndexFallback('t', async () => ['fast'], fallback)).resolves.toEqual(['fast']);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('falls back when the index is missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(withIndexFallback('t2', async () => Promise.reject(missingIndex), async () => ['slow'])).resolves.toEqual(['slow']);
  });

  it('does not hide other errors (e.g. permission denied)', async () => {
    const denied = Object.assign(new Error('denied'), { code: 'permission-denied' });
    await expect(withIndexFallback('t3', async () => Promise.reject(denied), async () => ['slow'])).rejects.toBe(denied);
  });

  it('sorts newest first by millis or Timestamp, pending timestamps first', () => {
    const ts = (ms: number) => ({ toMillis: () => ms });
    const items = [{ id: 'a', t: ts(1000) }, { id: 'b', t: 3000 }, { id: 'c', t: null }, { id: 'd', t: ts(2000) }];
    expect(sortNewest(items, 't').map((x) => x.id)).toEqual(['c', 'b', 'd', 'a']);
  });
});
