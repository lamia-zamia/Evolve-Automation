/**
 * Pure decision for the per-period debug-clone gate.
 *
 * The game updates every resource's `diff` and then reads `settings.expose` to decide whether to
 * deep-clone its state, both inside one statement of its per-period loop. A pulse therefore always
 * lands immediately before the read it is meant to answer, and nothing can run in between: the
 * whole sequence is synchronous. That is what lets the gate close for exactly one read per skipped
 * period, so every other reader of `expose` -- the autosave above all -- still sees the player's
 * own value.
 */

export interface PeriodGateState {
  /** Periods since the last working one; 0 is a working period. */
  readonly period: number;
  /** Whether one upcoming `expose` read should answer "skip". */
  readonly closed: boolean;
}

export const initialPeriodGateState: PeriodGateState = Object.freeze({
  period: 0,
  closed: false,
});

/**
 * Advances one game period. A rate below 2 gates nothing, so it resets to the open state rather
 * than closing a read the caller would then have to reopen.
 */
export function pulsePeriodGate(
  state: PeriodGateState,
  rate: number,
): PeriodGateState {
  if (!Number.isFinite(rate) || rate < 2) {
    return initialPeriodGateState;
  }
  const period = state.period + 1 >= rate ? 0 : state.period + 1;
  return Object.freeze({ period, closed: period !== 0 });
}

/**
 * Consumes at most one closed read. Reads that arrive without a preceding pulse are answered with
 * the player's value, which is what makes a pulse that stops fail open instead of leaving the
 * game's debug data -- and the script's only wake-up -- switched off.
 */
export function consumePeriodGate(state: PeriodGateState): {
  readonly state: PeriodGateState;
  readonly exposed: boolean;
} {
  if (!state.closed) {
    return { state, exposed: true };
  }
  return {
    state: Object.freeze({ period: state.period, closed: false }),
    exposed: false,
  };
}
