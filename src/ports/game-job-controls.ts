/**
 * The game's own job assignment controls.
 *
 * Automation asks a job control to move a number of people onto or off one job,
 * and asks the civics tab which job newcomers default to. Callers above this
 * port name the control by the element id the game gives it, and name the
 * crafted resource for the controls that serve every craft from one element.
 * How many component calls a count takes, and which method performs them, is
 * this port's business.
 */
export interface GameJobAssignmentRequest {
  /** The element the game gives this job's worker or servant control. */
  readonly elementId: string;

  /** How many people to move. Counts of zero or less move nobody. */
  readonly count: number;

  /**
   * The crafted resource, for the crafting and skilled-servant controls that
   * serve every crafted resource from a single element.
   */
  readonly craftedResourceId?: string;
}

export interface GameDefaultJobRequest {
  /** The element of the job's own worker control. */
  readonly elementId: string;

  /** The job newcomers should be assigned to. */
  readonly jobId: string;
}

export interface GameJobControlsPort {
  /** Moves people onto the job. False means the control was not actionable. */
  assign(request: GameJobAssignmentRequest): boolean;

  /** Moves people off the job. False means the control was not actionable. */
  unassign(request: GameJobAssignmentRequest): boolean;

  /** Makes the job the default one. False means the control was not actionable. */
  setDefault(request: GameDefaultJobRequest): boolean;
}
