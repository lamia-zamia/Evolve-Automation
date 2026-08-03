/**
 * The game's own industry production weighting controls.
 *
 * An industry panel splits one facility's output between competing productions,
 * and automation moves that split a number of steps in either direction.
 * Callers above this port name the control by the element id the game gives it,
 * and name the production for the panels that weigh several productions from a
 * single element. How many component calls a count takes, and which method
 * performs them, is this port's business.
 */
export interface GameIndustryWeightRequest {
  /** The element the game gives this industry panel's weighting control. */
  readonly elementId: string;

  /** How many steps to move the split. Counts of zero or less move nothing. */
  readonly count: number;

  /**
   * The production being weighed, for the panels that weigh several productions
   * from a single element.
   */
  readonly productionId?: string;
}

export interface GameIndustryControlsPort {
  /** Whether the game currently renders the panel's weighting control. */
  isRendered(elementId: string): boolean;

  /**
   * Moves weight onto the production. False means the control was not
   * actionable.
   */
  increase(request: GameIndustryWeightRequest): boolean;

  /**
   * Moves weight off the production. False means the control was not
   * actionable.
   */
  decrease(request: GameIndustryWeightRequest): boolean;
}
