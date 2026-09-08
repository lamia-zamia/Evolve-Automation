/**
 * Read-only evidence that a captured game control was actually executed.
 *
 * The ledger intentionally records no arguments or return values. Those are live game objects and
 * would turn a verification aid into another mutable game-state surface.
 */
export interface GameControlUsage {
  readonly elementId: string;
  readonly method: string;
  readonly returned: number;
  readonly threw: number;
}

export interface GameControlUsageReader {
  /** Usage in first-execution order, with counts aggregated per control method. */
  readUsage(): readonly GameControlUsage[];
}
