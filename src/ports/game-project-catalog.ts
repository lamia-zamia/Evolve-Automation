import type { ProjectOffer } from "../domain/progression/research/project.ts";

/** One currently available A.R.P.A. project, priced for a single percentage point. */
export type OfferedProject = ProjectOffer;

export interface GameProjectCatalog {
  /** A fresh snapshot in the game's display order, or `undefined` when it could not be read. */
  readProjects(): readonly Readonly<OfferedProject>[] | undefined;
}
