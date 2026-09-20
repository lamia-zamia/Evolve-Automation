/**
 * Retry-safe state for the one-shot tab draws the captured features need.
 *
 * A draw can fail for reasons that pass on their own: the target panel is a tick from being built,
 * a sub-tab control is mid-rebuild, mount suppression is briefly unavailable, the workspace cannot
 * be restored yet. The `*DiscoveryAttempted` booleans this replaces spent their single attempt on
 * exactly those, and left the feature dark for the rest of the page session.
 *
 * An attempt is therefore scoped to an epoch rather than to the session, and only a *satisfied*
 * capability retires it. A failure stays retryable, backed off by whole automation cycles so a
 * feature that can never succeed does not redraw its tab on every phase call.
 */

/**
 * Cycles to wait after `failures` consecutive failures: 1, 2, 4, 8, 16, then 32 forever. The first
 * retry lands on the very next cycle, which is what a panel that was one tick late needs.
 */
const DISCOVERY_RETRY_CYCLE_CAP = 32;

function discoveryRetryDelay(failures: number): number {
  return Math.min(2 ** Math.max(0, failures - 1), DISCOVERY_RETRY_CYCLE_CAP);
}

interface DiscoveryAttemptRecord {
  readonly epoch: string;
  satisfied: boolean;
  failures: number;
  nextCycle: number;
}

export interface DiscoveryAttemptTracker {
  /** True when a fresh attempt for `key` is worth making on the current cycle. */
  shouldAttempt(key: string, epoch?: string): boolean;
  /** The feature holds the capability it came for; stop attempting within this epoch. */
  recordSuccess(key: string, epoch?: string): void;
  /** The draw failed, or drew without capturing the capability; schedule a later retry. */
  recordFailure(key: string, epoch?: string): void;
  /**
   * Every recorded attempt is tied to the page root it was made against. A replacement makes the
   * captured controls non-authoritative, so all of it becomes eligible again.
   */
  invalidate(): void;
  /** Test and diagnostic view of one key's state. */
  describe(key: string, epoch?: string): string;
}

export interface DiscoveryAttemptDependencies {
  /** Advances once per automation cycle; attempts are rate-limited against it. */
  readonly readCycle: () => number;
}

export function createDiscoveryAttempts({
  readCycle,
}: DiscoveryAttemptDependencies): DiscoveryAttemptTracker {
  const records = new Map<string, DiscoveryAttemptRecord>();
  const currentEpoch = (epoch: string | undefined): string => epoch ?? "";
  const read = (
    key: string,
    epoch: string | undefined,
  ): DiscoveryAttemptRecord | undefined => {
    const record = records.get(key);
    // A feature that names its own epoch — a progression reset, say — starts over when that epoch
    // changes, because the controls the previous attempt captured no longer describe the game.
    return record !== undefined && record.epoch === currentEpoch(epoch)
      ? record
      : undefined;
  };
  const write = (
    key: string,
    epoch: string | undefined,
    satisfied: boolean,
  ): void => {
    const previous = read(key, epoch);
    const failures = satisfied ? 0 : (previous?.failures ?? 0) + 1;
    records.set(key, {
      epoch: currentEpoch(epoch),
      satisfied,
      failures,
      nextCycle: satisfied ? 0 : readCycle() + discoveryRetryDelay(failures),
    });
  };
  return Object.freeze({
    shouldAttempt(key: string, epoch?: string): boolean {
      const record = read(key, epoch);
      if (record === undefined) return true;
      return record.satisfied ? false : readCycle() >= record.nextCycle;
    },
    recordSuccess(key: string, epoch?: string): void {
      write(key, epoch, true);
    },
    recordFailure(key: string, epoch?: string): void {
      write(key, epoch, false);
    },
    invalidate(): void {
      records.clear();
    },
    describe(key: string, epoch?: string): string {
      const record = read(key, epoch);
      if (record === undefined) return "never-tried";
      return record.satisfied
        ? "satisfied"
        : `failed(${record.failures}) retry-at-${record.nextCycle}`;
    },
  });
}
