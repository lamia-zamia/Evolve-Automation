/** One currently available A.R.P.A. project, priced for a single percentage point. */
export interface OfferedProject {
  readonly elementId: string;
  readonly projectId: string;
  readonly rank: number;
  readonly progress: number;
  readonly cost: Readonly<Record<string, number>>;
  readonly generation: number;
}

export interface GameProjectCatalog {
  /** A fresh snapshot in the game's display order, or `undefined` when it could not be read. */
  readProjects(): readonly Readonly<OfferedProject>[] | undefined;
}
