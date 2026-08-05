/**
 * The game's own click-multiplier keys.
 *
 * Evolve multiplies what one click of a panel button does while its x100, x25
 * and x10 modifier keys are held, so automation buys a large count with far
 * fewer component calls than that count. Callers above this port say how many
 * units they want and call the panel once per step the port hands back; which
 * modifiers are held for a given step, and whether the game supports them at
 * all, is this port's business.
 */
export interface GameClickMultipliersPort {
  /**
   * One element per component call needed to cover `count` units, with the
   * modifier keys for that call already held. Iterating is what holds them, so
   * a caller that may not act should only start the sequence once it will.
   * Counts of zero or less yield nothing.
   */
  steps(count: number): Iterable<unknown>;

  /** Releases every modifier key the port is holding. */
  clear(): void;
}
