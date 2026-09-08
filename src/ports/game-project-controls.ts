/** One purchase of an A.R.P.A. project, of one or more steps at a time. */
export interface GameProjectBuildRequest {
  /** The element the game mounted the project's controls on. */
  readonly elementId: string;

  /** The project the control expects to be told to build. */
  readonly projectId: string;

  /** How many steps of the project to buy in this one call. */
  readonly steps: number;
}

/**
 * The game's own project controls.
 *
 * A project is bought in steps rather than in whole units, so it is the one
 * action that cannot go through the ordinary build path. Callers above this
 * port describe the purchase; the adapter delegates it to the game's own
 * mounted control.
 */
export interface GameProjectControlsPort {
  /**
   * Buys the requested steps. False means the control was gone and nothing was
   * built, so a caller must not record the purchase it was about to make.
   */
  build(request: GameProjectBuildRequest): boolean;
}
