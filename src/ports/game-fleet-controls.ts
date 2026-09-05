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

/** Building one ship of the configured blueprint. */
export interface GameFleetBuildRequest {
  /** The element the game gives this panel's control. */
  readonly elementId: string;
}

/** What a build attempt did. */
export interface GameFleetBuildResult {
  /** Whether the build control was actionable at all. */
  readonly actionable: boolean;

  /**
   * The new ship's position in the shipyard's own list, or null when no ship
   * was appended. A cost the yard cannot pay queues the order instead of
   * building, and a queued order appends nothing.
   */
  readonly builtIndex: number | null;
}

/**
 * Sending one built ship to a region. The game offers no direct call for this:
 * a ship row opens a dispatch window listing its reachable regions, and the
 * region's own control performs the move. So a dispatch is a modal interaction,
 * not a method call, and the caller drives it through the modal port.
 */
export interface GameFleetDispatchRequest {
  /** The ship's position in the shipyard's own list. */
  readonly index: number;

  /** The region the ship is sent to, as the game names it. */
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
   * Builds one ship of the configured blueprint. A built ship starts at the
   * shipyard and is sent onward with `dispatchShip`.
   */
  buildShip(request: GameFleetBuildRequest): GameFleetBuildResult;

  /** The control that opens the dispatch window for the ship at `index`. */
  dispatchTrigger(index: number): string;

  /**
   * Sends the ship to the region from inside its open dispatch window. False
   * means the window did not offer that destination.
   */
  dispatchShip(request: GameFleetDispatchRequest): boolean;

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
