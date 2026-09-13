import type { ProjectOffer } from "../domain/progression/research/project.ts";

/** One currently available A.R.P.A. project, priced for a single percentage point. */
export type OfferedProject = ProjectOffer;

export interface GameProjectCatalog {
  /** A fresh snapshot in the game's display order, or `undefined` when it could not be read. */
  readProjects(): readonly Readonly<OfferedProject>[] | undefined;
  /**
   * The same rows with everything that lives in game state rather than in the drawn popover taken
   * fresh: each project's rank, how far the current copy has progressed, and the
   * captured-control generation.
   *
   * Only the per-percent price comes from the draw, and that price moves with rank alone. Progress
   * moves every time the script buys a percentage point, so a sample held across ticks must restate
   * it; redrawing the A.R.P.A. panel to learn a number already sitting in `game.arpa` would be the
   * expensive way to ask.
   */
  restate(
    projects: readonly Readonly<OfferedProject>[],
  ): readonly Readonly<OfferedProject>[] | undefined;
}
