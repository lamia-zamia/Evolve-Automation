import type { ProjectOffer } from "../domain/progression/research/project.ts";

/** One currently available A.R.P.A. project, priced for a single percentage point. */
export type OfferedProject = ProjectOffer;

export interface GameProjectCatalog {
  /**
   * A fresh snapshot in the game's display order, or `undefined` when it could not be read.
   *
   * Establishes the native lexical mechanics on the first call, which is the only moment a Physics
   * draw is needed; every later call reads live game state and costs no draw.
   */
  readProjects(): readonly Readonly<OfferedProject>[] | undefined;
}
