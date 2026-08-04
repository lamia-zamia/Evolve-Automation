/**
 * The game's own fleet panels.
 *
 * Two panels: the outer shipyard (`shipPlans`), where a ship blueprint is
 * configured part by part and one ship of it is built and parked in a region,
 * and the piracy armada (`fleet`), where ships are moved between the gateway
 * and a defended region. Callers name the control by the element id the game
 * gives it, and name the ship part with its position in the panel's option
 * list for the availability checks. How many component calls a count takes,
 * and which methods perform them, is this port's business.
 */
export interface GameFleetPartRequest {
  /** The element the game gives this panel's control. */
  readonly elementId: string;

  /** The blueprint dimension: class, power, weapon, armor, engine, or sensor. */
  readonly type: string;

  /** The part to configure or check. */
  readonly part: string;

  /**
   * The part's position in the panel's option list. Availability checks
   * require it; configuring a part ignores it.
   */
  readonly index?: number;
}

/** Moving ships on the piracy armada. */
export interface GameFleetStepRequest {
  /** The element the game gives this panel's control. */
  readonly elementId: string;

  /** The region the ships move between, as the game names it. */
  readonly region: string;

  /** The ship type being moved. */
  readonly ship: string;

  /** How many click steps to move. Counts of zero or less move nothing. */
  readonly count: number;
}

/** Building one ship of the configured blueprint and parking it in a region. */
export interface GameFleetBuildRequest {
  /** The element the game gives this panel's control. */
  readonly elementId: string;

  /** The region the built ship is assigned to. */
  readonly region: string;
}

export interface GameFleetControlsPort {
  /** Whether the game currently renders the panel's control. */
  isRendered(elementId: string): boolean;

  /**
   * Whether the panel offers the part at the given option position. False
   * means the part is not selectable or the control is not actionable.
   */
  isPartAvailable(request: GameFleetPartRequest): boolean;

  /**
   * Selects a blueprint part on the panel. False means the control was not
   * actionable.
   */
  setPart(request: GameFleetPartRequest): boolean;

  /**
   * Whether the configured blueprint has enough power to build. False means
   * the control could not confirm it.
   */
  hasShipPower(elementId: string): boolean;

  /**
   * Builds one ship of the configured blueprint and assigns it to the region.
   * False means the control was not actionable.
   */
  buildShip(request: GameFleetBuildRequest): boolean;

  /**
   * Moves ships from the gateway to the region, one click step at a time.
   * False means the control was not actionable.
   */
  addShips(request: GameFleetStepRequest): boolean;

  /**
   * Moves ships from the region back to the gateway, one click step at a
   * time. False means the control was not actionable.
   */
  subShips(request: GameFleetStepRequest): boolean;
}
