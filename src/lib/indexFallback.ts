/**
 * Graceful degradation when Firestore composite indexes are not deployed.
 *
 * Queries that combine `where(...)` with `orderBy(...)` on another field need a
 * composite index (see firestore.indexes.json). If the project doesn't have it
 * yet, Firestore rejects the query with `failed-precondition`. In that case we
 * run an index-free variant (equality filters only) and sort on the device.
 * Once the indexes exist, the fast indexed query is used automatically.
 */
import { getDocs, limit, onSnapshot, orderBy, query, type DocumentData, type Query, type QueryConstraint, type QueryDocumentSnapshot } from 'firebase/firestore';

export function isMissingIndexError(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  return !!err && (err.code === 'failed-precondition' || err.code === 'firestore/failed-precondition') && /index/i.test(err.message ?? '');
}

const warned = new Set<string>();
function warnOnce(label: string) {
  if (warned.has(label)) return;
  warned.add(label);
  console.warn(`[ROAM] Firestore index missing for "${label}" – using on-device sorting. Deploy firestore.indexes.json for best performance.`);
}

/** Run `primary`; if it fails only because an index is missing, run `fallback` instead. */
export async function withIndexFallback<T>(label: string, primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await primary();
  } catch (e) {
    if (!isMissingIndexError(e)) throw e;
    warnOnce(label);
    return fallback();
  }
}

/** Sort newest-first by a millisecond number or Firestore Timestamp field; pending server timestamps count as "now". */
export function sortNewest<T>(items: T[], field: keyof T): T[] {
  const ms = (v: unknown): number => {
    if (v == null) return Date.now();
    if (typeof v === 'number') return v;
    const t = v as { toMillis?: () => number };
    return typeof t.toMillis === 'function' ? t.toMillis() : 0;
  };
  return [...items].sort((a, b) => ms(b[field]) - ms(a[field]));
}

/**
 * Real-time listener with the same fallback: subscribes to `primary`, and if it
 * errors because of a missing index, re-subscribes to `fallback`.
 */
export function onSnapshotWithIndexFallback(
  label: string,
  primary: Query<DocumentData>,
  fallback: Query<DocumentData>,
  next: (docs: QueryDocumentSnapshot<DocumentData>[], viaFallback: boolean) => void,
  onError: (e: Error) => void,
): () => void {
  let unsub = onSnapshot(
    primary,
    (s) => next(s.docs, false),
    (e) => {
      if (!isMissingIndexError(e)) return onError(e);
      warnOnce(label);
      unsub = onSnapshot(fallback, (s) => next(s.docs, true), onError);
    },
  );
  return () => unsub();
}

/** How many documents the index-free fallback reads before sorting on the device. */
export const FALLBACK_SCAN_LIMIT = 500;

/**
 * Newest `max` documents matching equality `filters`, ordered by `field` desc.
 * Uses the composite index when available, otherwise filters-only + on-device sort.
 */
export async function fetchNewestDocs(
  label: string,
  coll: Query<DocumentData>,
  filters: QueryConstraint[],
  field: string,
  max: number,
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  return withIndexFallback(
    label,
    async () => (await getDocs(query(coll, ...filters, orderBy(field, 'desc'), limit(max)))).docs,
    async () => {
      const docs = (await getDocs(query(coll, ...filters, limit(FALLBACK_SCAN_LIMIT)))).docs;
      return sortNewest(docs.map((d) => ({ d, v: d.get(field) })), 'v').map((x) => x.d).slice(0, max);
    },
  );
}
