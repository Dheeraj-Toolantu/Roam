/**
 * Handles one batch of background location fixes. Dependencies are injected so
 * this runs identically in the app, in a headless (app-killed) launch, and in
 * unit tests (tests/unit/backgroundProcessor.test.ts).
 */
import { EMPTY_BG_STATE, markWritten, needsBackgroundUpdates, processBatch, type BgPoint, type BgState, type RawFix } from '../logic/background';
import type { LivePoint } from '../logic/live';

export interface JourneyForWrite {
  id: string;
  status: 'active' | 'paused' | 'completed';
  cityIds: string[];
  route: { lat: number; lng: number }[];
  anchorCityId: string | null;
}

export interface BgDeps {
  loadState(): Promise<BgState>;
  saveState(s: BgState): Promise<void>;
  /** Signed-in uid once auth has been restored from persistence (null if signed out). */
  currentUid(): Promise<string | null>;
  getJourney(id: string): Promise<JourneyForWrite | null>;
  saveBatch(j: JourneyForWrite, points: BgPoint[], addedKm: number): Promise<void>;
  publishLive(groupId: string, uid: string, name: string, fix: LivePoint): Promise<void>;
  stopUpdates(): Promise<void>;
}

export interface BatchOutcome {
  written: number;
  queued: number;
  published: string[];
  stopped: boolean;
  reason?: 'signed-out' | 'journey-ended' | 'nothing-to-track';
}

export async function processBackgroundBatch(fixes: RawFix[], deps: BgDeps): Promise<BatchOutcome> {
  let state = await deps.loadState();
  const out: BatchOutcome = { written: 0, queued: 0, published: [], stopped: false };

  const uid = await deps.currentUid();
  if (!uid || uid !== state.uid) {
    // Never record for a signed-out or different account.
    await deps.saveState(EMPTY_BG_STATE);
    await deps.stopUpdates();
    return { ...out, stopped: true, reason: 'signed-out' };
  }

  const r = processBatch(state, fixes);
  state = r.state;
  await deps.saveState(state); // persist filter position first so re-delivered fixes are not double-counted

  // ---- journey points
  const journeyId = state.journeyId;
  if (journeyId && r.toWrite.length) {
    const j = await deps.getJourney(journeyId).catch(() => undefined);
    if (j === null || j?.status === 'completed') {
      state = { ...markWritten(state), journeyId: null, lastFix: null };
      out.reason = 'journey-ended';
    } else if (j && j.status === 'active') {
      try {
        await deps.saveBatch(j, r.toWrite, r.addedKm);
        out.written = r.toWrite.length;
        state = markWritten(state);
      } catch {
        out.queued = r.toWrite.length; // offline / transient: retry with the next batch
      }
    } else {
      out.queued = r.toWrite.length; // paused or journey unreadable right now
    }
  }

  // ---- crew live sharing
  const name = state.displayName;
  if (r.publish && name) {
    for (const g of state.shareGroups) {
      try {
        await deps.publishLive(g, uid, name, r.publish);
        out.published.push(g);
      } catch (e) {
        if ((e as { code?: string }).code === 'permission-denied') {
          state = { ...state, shareGroups: state.shareGroups.filter((x) => x !== g) }; // no longer a member
        }
      }
    }
  }

  await deps.saveState(state);
  if (!needsBackgroundUpdates(state)) {
    await deps.stopUpdates();
    out.stopped = true;
    out.reason ??= 'nothing-to-track';
  }
  return out;
}
