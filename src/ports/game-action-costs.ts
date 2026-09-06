/**
 * The game's own current cost for an action, adjusted for count, inflation, traits, and every
 * other multiplier the game applies — asked of the game rather than recomputed.
 */
export interface GameActionCostReader {
  /**
   * Costs for one action id (`city-basic_housing`, `space-spaceport`), keyed by the game's
   * resource names. `undefined` when the game cannot price the action: the cost source is not
   * available yet, or the id is one the game does not resolve.
   *
   * Keys are whatever the game charges, which includes non-resource costs such as `Morale` on
   * the actions that have them. Callers must not assume every key names a stored resource.
   */
  readCost(actionId: string): Readonly<Record<string, number>> | undefined;
}
