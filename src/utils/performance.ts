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
  /** Optional shared nesting context for callers that compose phase measurements. */
  readonly measurePhase?: <T>(phase: string, action: () => T) => T;
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

export interface ExclusivePhaseMeasure {
  readonly measure: MeasurePhase;
  readonly record: (phase: string, durationMs: number) => void;
  readonly readTotalMs: () => number;
}

const runUnmeasured: MeasurePhase = (_phase, action) => action();

const INERT_EXCLUSIVE_MEASURE: ExclusivePhaseMeasure = Object.freeze({
  measure: runUnmeasured,
  record: () => {},
  readTotalMs: () => 0,
});

/**
 * Measures named work as exclusive time. Child phases subtract their full duration from the
 * parent, so the total of all recorded phases does not count nested work twice. `record` admits
 * an externally timed, non-nested section into the same ownership total.
 */
export function createExclusivePhaseMeasure(
  diagnostics: PhaseTimingSink | undefined,
): ExclusivePhaseMeasure {
  if (diagnostics === undefined || !diagnostics.readPerformanceEnabled()) {
    return INERT_EXCLUSIVE_MEASURE;
  }

  const stack: { childMs: number }[] = [];
  let totalMs = 0;
  const record = (phase: string, durationMs: number) => {
    if (!Number.isFinite(durationMs)) return;
    totalMs += durationMs;
    const parent = stack[stack.length - 1];
    if (parent !== undefined) parent.childMs += durationMs;
    diagnostics.recordPerformance(phase, durationMs);
  };
  const measure: MeasurePhase = (phase, action) => {
    const startedAtMs = diagnostics.nowMs();
    const frame = { childMs: 0 };
    stack.push(frame);
    try {
      return action();
    } finally {
      const elapsedMs = diagnostics.nowMs() - startedAtMs;
      stack.pop();
      const exclusiveMs = Math.max(0, elapsedMs - frame.childMs);
      totalMs += exclusiveMs;
      const parent = stack[stack.length - 1];
      if (parent !== undefined) parent.childMs += elapsedMs;
      diagnostics.recordPerformance(phase, exclusiveMs);
    }
  };
  return Object.freeze({ measure, record, readTotalMs: () => totalMs });
}

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
  if (diagnostics.measurePhase !== undefined) {
    const measurePhase = diagnostics.measurePhase;
    return (phase, action) => measurePhase(phase, action);
  }
  const stack: { childMs: number }[] = [];
  return (phase, action) => {
    const startedAtMs = diagnostics.nowMs();
    const frame = { childMs: 0 };
    stack.push(frame);
    try {
      return action();
    } finally {
      const elapsedMs = diagnostics.nowMs() - startedAtMs;
      stack.pop();
      const exclusiveMs = Math.max(0, elapsedMs - frame.childMs);
      const parent = stack[stack.length - 1];
      if (parent !== undefined) parent.childMs += elapsedMs;
      diagnostics.recordPerformance(phase, exclusiveMs);
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
