/**
 * Keeps a panel sample until something could have changed it.
 *
 * Sampling a panel costs a `loadTab` draw, which is the most expensive thing the captured runtime
 * does per tick. A scope here owns one such sample and re-takes it only when the progression epoch
 * moves or the sample has aged out.
 *
 * The age is the honest half of this. The epoch cannot be a complete account of what the game's
 * draws read, so a scope that trusted it alone would eventually serve an answer the game no longer
 * agrees with. Instead each scope carries a maximum age, and that age adapts: a resample that
 * produces the same answer doubles the interval up to `MAX_SAMPLE_AGE_MS`, and one that produces a
 * different answer drops it straight back to `MIN_SAMPLE_AGE_MS`. A scope in the middle of
 * progression therefore re-reads at close to the unconditional rate, and an idle one settles at the
 * ceiling. Removing the fallback once the epoch is trusted is deleting `widenedAgeMs` and the two
 * constants above it.
 *
 * A sample never stores a control generation. The game rebinds a control whenever it draws the
 * panel — the player opening the tab is enough — and `vue-capture` records that and increments the
 * generation on its own, so a caller re-resolves the handle from the registry at use time. A stale
 * generation is not a reason to draw anything.
 */

import {
  createCountTally,
  type PhaseTimingSink,
} from "../../utils/performance.ts";

/**
 * The shortest a scope will hold a sample when the epoch has not moved. Chosen below the automation
 * work-tick period so a scope that keeps finding changes behaves like the unconditional sampling it
 * replaced.
 */
export const MIN_SAMPLE_AGE_MS = 1_000;

/** The longest a scope will hold a sample. The bound on how stale an offer set can get. */
export const MAX_SAMPLE_AGE_MS = 16_000;

export interface DiscoveryScopeCacheDependencies {
  /** Changes when progression could have changed what a sampled panel offers. */
  readonly readEpoch: () => string;
  readonly nowMs: () => number;
  readonly diagnostics?: PhaseTimingSink | undefined;
}

export interface DiscoveryScopeCache {
  /**
   * The scope's current sample, taken afresh only when it has to be.
   *
   * `take` performs the draw. `isSameAnswer` compares two samples so an unchanged resample can
   * widen the interval; a scope that cannot compare its samples cheaply omits it and keeps the
   * minimum interval. A `take` that returns `undefined` is a failed sample: nothing is cached and
   * the next call tries again, because serving a previous answer in place of a failed read is how
   * a script spends on an offer the game has already withdrawn.
   */
  read<T>(
    scope: string,
    take: () => T | undefined,
    isSameAnswer?: (previous: T, next: T) => boolean,
  ): T | undefined;
  /** Drops a scope's sample so the next read re-takes it. */
  invalidate(scope: string): void;
  /** Drops every scope's sample. */
  invalidateAll(): void;
}

interface ScopeEntry {
  epoch: string;
  takenAtMs: number;
  ageMs: number;
  sample: unknown;
}

/**
 * Whether two priced offers name the same thing at the same price. Shared by every scope whose
 * sample is a list of offers, so one notion of "the answer did not change" drives the backoff.
 * Deliberately blind to anything a caller restates from live state afterwards — a control
 * generation, an A.R.P.A. rank — because those moving is not the panel's answer moving.
 */
export function sameOfferPrices(
  previous: readonly Readonly<{
    elementId: string;
    cost: Readonly<Record<string, number>>;
  }>[],
  next: readonly Readonly<{
    elementId: string;
    cost: Readonly<Record<string, number>>;
  }>[],
): boolean {
  if (previous.length !== next.length) return false;
  for (const [index, before] of previous.entries()) {
    const after = next[index];
    if (after === undefined || before.elementId !== after.elementId) {
      return false;
    }
    const names = Object.keys(before.cost);
    if (names.length !== Object.keys(after.cost).length) return false;
    for (const name of names) {
      if (before.cost[name] !== after.cost[name]) return false;
    }
  }
  return true;
}

/** The next interval to hold a sample for, given whether this resample changed the answer. */
function widenedAgeMs(currentMs: number, changed: boolean): number {
  if (changed) return MIN_SAMPLE_AGE_MS;
  return Math.min(currentMs * 2, MAX_SAMPLE_AGE_MS);
}

export function createDiscoveryScopeCache(
  dependencies: DiscoveryScopeCacheDependencies,
): DiscoveryScopeCache {
  const { readEpoch, nowMs, diagnostics } = dependencies;
  const entries = new Map<string, ScopeEntry>();

  return Object.freeze({
    read<T>(
      scope: string,
      take: () => T | undefined,
      isSameAnswer?: (previous: T, next: T) => boolean,
    ): T | undefined {
      const tally = createCountTally(diagnostics);
      const epoch = readEpoch();
      const now = nowMs();
      const entry = entries.get(scope);
      if (
        entry !== undefined &&
        entry.epoch === epoch &&
        now - entry.takenAtMs < entry.ageMs
      ) {
        tally.count(`discovery.cached ${scope}`);
        return entry.sample as T;
      }

      tally.count(`discovery.resample ${scope}`);
      const sample = take();
      if (sample === undefined) {
        // A failed read is not an answer. Drop what was held rather than let a caller act on a
        // sample the game has since replaced.
        entries.delete(scope);
        return undefined;
      }
      const unchanged =
        entry !== undefined &&
        entry.epoch === epoch &&
        isSameAnswer !== undefined &&
        isSameAnswer(entry.sample as T, sample);
      if (unchanged) tally.count(`discovery.unchanged ${scope}`);
      entries.set(scope, {
        epoch,
        takenAtMs: now,
        ageMs: widenedAgeMs(entry?.ageMs ?? MIN_SAMPLE_AGE_MS, !unchanged),
        sample,
      });
      return sample;
    },
    invalidate(scope: string): void {
      entries.delete(scope);
    },
    invalidateAll(): void {
      entries.clear();
    },
  });
}
