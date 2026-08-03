/**
 * The game's own manual crafting control.
 *
 * Automation asks for a number of a crafted resource to be made by hand.
 * Callers above this port name the control by the element id the game gives the
 * resource, name the resource, and give the exact amount they want. Which
 * component call crafts, and what has to be true of the page for the amount to
 * be taken literally, are this port's business.
 */
export interface GameCraftRequest {
  /** The element the game gives this resource's row. */
  readonly elementId: string;

  /** The resource to craft. */
  readonly resourceId: string;

  /** How many to craft. */
  readonly count: number;
}

export interface GameCraftingControlsPort {
  /** Crafts the resource by hand. False means the control was not actionable. */
  craft(request: GameCraftRequest): boolean;
}
