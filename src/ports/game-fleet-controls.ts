/**
 * The game's own fleet panels.
 *
 * Two panels: the outer shipyard (`shipPlans`), where a ship blueprint is
 * configured part by part and one ship of it is built and parked in a region,
 * and the piracy armada (`fleet`), where ships are moved between the gateway
 * and a defended region. Callers name the control by the element id the game
 * gives it, and name a ship part by its blueprint dimension and the part itself
 * — never by its position in the panel's option list. The position belongs to
 * the yard's own option markup and is part of the game's own availability
 * answer, so this port resolves it rather than asking its callers to know it.
 * How many component calls a count takes, and which methods perform them, is
 * this port's business.
 *
 * Sending a built ship onward is not here: the game offers no method for it, only a ship row's
 * dispatch closure, so that lives behind its own capture rather than as a panel method call.
 */
export interface GameFleetPartRequest {
  /** The element the game gives this panel's control. */
  readonly elementId: string;

  /** The blueprint dimension: the yard's class, power, weapon, armor, engine, sensor, or special. */
  readonly type: string;

  /** The part to configure or check. */
  readonly part: string;
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
  /** When supplied, require the live blueprint and appended ship to match it. */
  readonly expectedBlueprint?: Readonly<Record<string, string>>;
}

/**
 * What the native build attempt proved. `actionable` means the captured method completed without
 * an invocation error, never that a ship was built. A null index after invocation covers native
 * refusal, queueing, and any failed live ship-list postcondition without guessing a private cause.
 * A non-null index proves exactly one new ship matching `expectedBlueprint`, by live identity.
 */
export type GameFleetBuildResult =
  | { readonly actionable: false; readonly builtIndex: null }
  | { readonly actionable: true; readonly builtIndex: number | null };

export interface GameFleetControlsPort {
  /** Whether the game currently renders the panel's control. */
  isRendered(elementId: string): boolean;

  /**
   * Whether the panel offers this part at the option position its own markup gave it. False
   * means the part is not selectable, the panel never offered it, or the control is not
   * actionable.
   */
  isPartAvailable(request: GameFleetPartRequest): boolean;

  /**
   * Selects a blueprint part on the panel. False means the control was not
   * actionable.
   */
  setPart(request: GameFleetPartRequest): boolean;

  /**
   * The design the panel is holding right now, as the game's own control carries it.
   *
   * Not the saved design: the panel's live blueprint is what its own controls read and write,
   * including the fields a class change rewrote. Undefined when there is no such control or
   * the save has no design for it.
   */
  currentDesign(
    elementId: string,
  ): Readonly<Record<string, unknown>> | undefined;

  /**
   * Builds one ship of the configured blueprint. A built ship starts at the
   * shipyard and is sent onward with `dispatchShip`.
   */
  buildShip(request: GameFleetBuildRequest): GameFleetBuildResult;

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
