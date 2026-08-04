/**
 * The game's own industry panel controls.
 *
 * An industry panel splits one facility's output between competing items, and
 * automation moves that split a number of steps in either direction. The spell
 * panels are the same shape: the pylon (`iPylon`) and each alchemy transmute
 * panel move one spell's count up or down. Callers above this port name the
 * control by the element id the game gives it, and name the item for the panels
 * that weigh several items from a single element. How many component calls a
 * count takes, and which method performs them, is this port's business.
 */
export interface GameIndustryStepRequest {
  /** The element the game gives this industry panel's control. */
  readonly elementId: string;

  /** How many steps to move the split. Counts of zero or less move nothing. */
  readonly count: number;

  /**
   * The item being moved, for the panels that weigh several items from a
   * single element: a production, fuel, metal, or spell id.
   */
  readonly id?: string;
}

/** A one-shot selection on an industry panel, such as the replicator's target. */
export interface GameIndustrySelectionRequest {
  /** The element the game gives this industry panel's control. */
  readonly elementId: string;

  /** The item to select on the panel. */
  readonly id: string;
}

export interface GameIndustryControlsPort {
  /** Whether the game currently renders the panel's control. */
  isRendered(elementId: string): boolean;

  /**
   * Moves weight onto a production. False means the control was not
   * actionable.
   */
  increase(request: GameIndustryStepRequest): boolean;

  /**
   * Moves weight off a production. False means the control was not actionable.
   */
  decrease(request: GameIndustryStepRequest): boolean;

  /** Adds an item's share of the facility's split. */
  increaseItem(request: GameIndustryStepRequest): boolean;

  /** Removes an item's share of the facility's split. */
  decreaseItem(request: GameIndustryStepRequest): boolean;

  /** Adds a metal's share of the smelter's split. */
  increaseMetal(request: GameIndustryStepRequest): boolean;

  /** Removes a metal's share of the smelter's split. */
  decreaseMetal(request: GameIndustryStepRequest): boolean;

  /** Adds a fuel fed into the facility's split. */
  increaseFuel(request: GameIndustryStepRequest): boolean;

  /** Removes a fuel fed into the facility's split. */
  decreaseFuel(request: GameIndustryStepRequest): boolean;

  /** Adds weight to a galaxy trade route. */
  increaseTrade(request: GameIndustryStepRequest): boolean;

  /** Removes weight from a galaxy trade route. */
  decreaseTrade(request: GameIndustryStepRequest): boolean;

  /** Casts more of a spell on the pylon or alchemy panel. */
  increaseSpell(request: GameIndustryStepRequest): boolean;

  /** Casts less of a spell on the pylon or alchemy panel. */
  decreaseSpell(request: GameIndustryStepRequest): boolean;

  /**
   * Selects an item on the panel. False means the panel did not accept the
   * selection.
   */
  select(request: GameIndustrySelectionRequest): boolean;
}
