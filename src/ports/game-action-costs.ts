/**
 * The game's own current cost for an action, adjusted for count, inflation, traits, and every
 * other multiplier the game applies — asked of the game rather than recomputed.
 */

/** One action's adjusted price, and the supply pool the game would charge it to. */
export interface GameActionPrice {
  /**
   * Costs keyed by the game's resource names. Keys are whatever the game charges, which includes
   * non-resource costs such as `Morale` on the actions that have them. Callers must not assume
   * every key names a stored resource.
   */
  readonly cost: Readonly<Record<string, number>>;
  /**
   * The supply pool this action pays from, from the game's own `actionPool`. `undefined` whenever
   * the game does not name one: below `tech.shadow >= 5` it has no regional pools at all, and even
   * above it an action with no place of its own is unpooled. `"*"` is the game's sentinel for a
   * civilization-wide cost, which research uses.
   */
  readonly pool: string | undefined;
}

export interface GameActionCostReader {
  /**
   * Price for one action id (`city-basic_housing`, `space-spaceport`). `undefined` when the game
   * cannot price the action: the cost source is not available yet, or the id is one the game does
   * not resolve.
   */
  readCost(actionId: string): GameActionPrice | undefined;
}
