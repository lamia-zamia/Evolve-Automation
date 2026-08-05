/**
 * The game's own resource disposal panels.
 *
 * Each disposable resource gets its own panel: the hell lake transports take
 * a resource as supply, and the mass ejector throws one into the black hole.
 * Automation moves either amount a number of steps in each direction. Callers
 * above this port name the panel by the element id the game gives it and name
 * the resource the panel disposes of; how many component calls a count takes,
 * and which method performs them, is this port's business.
 */
export interface GameDisposalStepRequest {
  /** The element the game gives this resource's disposal panel. */
  readonly elementId: string;

  /** The resource the panel disposes of. */
  readonly id: string;

  /** How many steps to move the amount. Counts of zero or less move nothing. */
  readonly count: number;
}

export interface GameDisposalControlsPort {
  /** Whether the game currently renders the panel. */
  isRendered(elementId: string): boolean;

  /**
   * Sends more of a resource to the lake transports. False means the panel was
   * not actionable.
   */
  increaseSupply(request: GameDisposalStepRequest): boolean;

  /**
   * Sends less of a resource to the lake transports. False means the panel was
   * not actionable.
   */
  decreaseSupply(request: GameDisposalStepRequest): boolean;

  /**
   * Ejects more of a resource. False means the panel was not actionable.
   */
  increaseEject(request: GameDisposalStepRequest): boolean;

  /**
   * Ejects less of a resource. False means the panel was not actionable.
   */
  decreaseEject(request: GameDisposalStepRequest): boolean;
}
