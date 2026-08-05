/**
 * The game's own market panels.
 *
 * The market gives every tradable resource a row that buys and sells the
 * resource outright and adds or removes its trade routes, and a shared quantity
 * control that decides how much one buy or sell moves. Callers above this port
 * name the row by the element id the game gives it, name the resource the row
 * trades, and decide the trade is affordable; how many component calls a route
 * count takes, and which method performs them, is this port's business.
 */
export interface GameMarketRow {
  /** The element the game gives this resource's market row. */
  readonly elementId: string;

  /** The resource the row trades. */
  readonly id: string;
}

export interface GameMarketRouteRequest extends GameMarketRow {
  /** How many routes to move. Counts of zero or less move nothing. */
  readonly count: number;
}

export interface GameMarketControlsPort {
  /** Whether the game currently renders a resource's market row. */
  isRowRendered(elementId: string): boolean;

  /**
   * The largest quantity the shared control accepts. One means the game is not
   * offering the control, which is also the smallest quantity it ever trades.
   */
  maxMultiplier(): number;

  /**
   * Sets how much one buy or sell moves. False means the game was not offering
   * the control, so the next trade moves whatever it was already set to.
   */
  setMultiplier(multiplier: number): boolean;

  /**
   * Buys the current quantity of a resource. False means the row was not
   * actionable, so a caller must not record the Money it was about to spend.
   */
  buy(row: GameMarketRow): boolean;

  /**
   * Sells the current quantity of a resource. False means the row was not
   * actionable, so a caller must not record the Money it was about to earn.
   */
  sell(row: GameMarketRow): boolean;

  /** Removes every trade route on a resource. False means no route moved. */
  clearTradeRoutes(row: GameMarketRow): boolean;

  /** Adds importing trade routes. False means no route moved. */
  addTradeRoutes(request: GameMarketRouteRequest): boolean;

  /** Adds exporting trade routes. False means no route moved. */
  removeTradeRoutes(request: GameMarketRouteRequest): boolean;
}
