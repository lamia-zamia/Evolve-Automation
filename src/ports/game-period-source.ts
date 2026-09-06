/** One batch of game periods the game has finished executing. */
export interface CompletedGamePeriod {
  /**
   * How many periods the game was asked to run. The game reports more than one when its worker
   * timer drifts; it is reported as received rather than assumed to be one.
   */
  readonly periods: number;
}

/**
 * Completed game periods, observed from the game's own worker message handler.
 *
 * A notification means the game's handler returned, not that game state advanced: the game skips
 * its loops while paused and while offline catch-up is running. Subscribers that need "a period
 * actually ran" must test that themselves.
 */
export interface GamePeriodSource {
  subscribe(listener: (period: CompletedGamePeriod) => void): () => void;
}
