/**
 * The timing capability one measured phase needs. `TickDiagnostics` extends it.
 * It is declared here rather than in the port so the helper stays in the
 * dependency-free shared layer that both application and adapter code may
 * import.
 */
export interface PhaseTimingSink {
  readPerformanceEnabled(): boolean;
  nowMs(): number;
  recordPerformance(phase: string, durationMs: number): void;
  /**
   * Adds to a named tally. Counters answer "how many", not "how long": how
   * many candidates a loop saw, how many an early rule discarded, how many
   * times an expensive game call was made. They are only meaningful next to
   * the phase timings of the same capture.
   */
  recordCount(name: string, amount: number): void;
}

/** Runs one action under a named phase and returns its result unchanged. */
export type MeasurePhase = <T>(phase: string, action: () => T) => T;

const runUnmeasured: MeasurePhase = (_phase, action) => action();

/**
 * Builds the phase timer for one automation run or cycle.
 *
 * The enabled flag is sampled once, here, so a run measures either all of its
 * phases or none of them and the disabled path costs one closure call per
 * phase. Call this at the start of each run rather than where a factory is
 * constructed, or the flag is frozen at startup and the toggle never takes
 * effect.
 *
 * The record is emitted in a `finally`, so a phase that throws is still timed.
 * Flushing belongs to tick orchestration, not here.
 */
export function createPhaseMeasure(
  diagnostics: PhaseTimingSink | undefined,
): MeasurePhase {
  if (diagnostics === undefined || !diagnostics.readPerformanceEnabled()) {
    return runUnmeasured;
  }
  return (phase, action) => {
    const startedAtMs = diagnostics.nowMs();
    try {
      return action();
    } finally {
      diagnostics.recordPerformance(phase, diagnostics.nowMs() - startedAtMs);
    }
  };
}

/**
 * A counter tally for one measured run, or an inert one when diagnostics are
 * off.
 *
 * `enabled` is exposed so a caller can skip building the counter name at all.
 * Tallies live in loops whose cost is the thing under measurement, and a
 * template string built per iteration and then discarded is exactly the kind
 * of overhead that would distort the reading.
 */
export interface CountTally {
  readonly enabled: boolean;
  readonly count: (name: string, amount?: number) => void;
}

const INERT_TALLY: CountTally = Object.freeze({
  enabled: false,
  count: () => {},
});

/** Builds the counter tally for one run. Sample the flag per run, as with `createPhaseMeasure`. */
export function createCountTally(
  diagnostics: PhaseTimingSink | undefined,
): CountTally {
  if (diagnostics === undefined || !diagnostics.readPerformanceEnabled()) {
    return INERT_TALLY;
  }
  return Object.freeze({
    enabled: true,
    count: (name: string, amount = 1) => diagnostics.recordCount(name, amount),
  });
}
