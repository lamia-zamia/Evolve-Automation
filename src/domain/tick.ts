/**
 * Pure tick bookkeeping. The application runner owns the load-bearing order in which the tick's
 * controllers run; these functions own only the gating arithmetic (skip, counter wrap, throttle,
 * state-log cadence) so it can be unit-tested away from the effectful controllers.
 */

/** Gating fields sampled before the tick does any bookkeeping. */
export interface TickStartSnapshot {
  readonly goal: string;
  readonly forcedUpdate: boolean;
  readonly gameTicked: boolean;
}

/**
 * Whether the tick should run at all this game tick. A pending game-over, a forced settings refresh,
 * or a tick the game has not actually run yet all abandon the tick before any bookkeeping happens.
 */
export function shouldStartTick(snapshot: TickStartSnapshot): boolean {
  return (
    snapshot.goal !== "GameOverMan" &&
    !snapshot.forcedUpdate &&
    snapshot.gameTicked
  );
}

/** Advances the script tick counter, wrapping to 1 instead of losing precision at the safe-integer top. */
export function advanceScriptTick(current: number): number {
  return current < Number.MAX_SAFE_INTEGER ? current + 1 : 1;
}

/**
 * Game periods per working script tick. Under the game's accelerated time the game runs its period
 * loop twice as often, so the same tickRate covers twice the periods.
 */
export function effectiveTickRate(
  tickRate: number,
  accelerated: boolean,
): number {
  return accelerated ? tickRate * 2 : tickRate;
}

/**
 * Whether this script tick is throttled (does no automation work). Not consulted while the period
 * gate is installed: there the game itself only wakes the script on working periods, and applying
 * this as well would compose the two rates.
 */
export function isThrottledTick(
  scriptTick: number,
  tickRate: number,
  accelerated: boolean,
): boolean {
  return scriptTick % effectiveTickRate(tickRate, accelerated) !== 0;
}

/**
 * Advances the state-log counter and reports whether a snapshot is due. The counter is in processed
 * ticks (this runs once per working cycle), so the interval does not drift with tickRate.
 */
export function advanceStateLog(
  current: number,
  interval: number,
): { readonly next: number; readonly record: boolean } {
  const next = current + 1;
  return { next, record: next % interval === 0 };
}
