/** One A.R.P.A. project row and its exact current per-percent price. */
export interface DrawnProject {
  readonly elementId: string;
  readonly projectId: string;
  readonly cost: Readonly<Record<string, number>>;
}

/** Reads the game-owned project popovers while the A.R.P.A. panel is drawn. */
export interface GameDrawnProjectsReader {
  /**
   * Returns `undefined` when reading would replace a popover the player already has open, or when
   * the game did not produce one exact price for every row.
   */
  read(
    selector: string,
    resourceNames: readonly string[],
  ): readonly Readonly<DrawnProject>[] | undefined;
  exists(selector: string): boolean;
}
