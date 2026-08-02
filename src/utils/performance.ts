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
