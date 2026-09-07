/**
 * Reading what the game has just drawn.
 *
 * The game writes each action's current price onto its element as `data-<Resource>` attributes,
 * computed with its own `adjustCosts` at draw time, and orders the elements the way it wants them
 * offered. For the panels whose contents have no other captured route — research above all, where
 * the offered set comes from `checkTechRequirements` and the catalog is module-lexical — that
 * rendered markup is the game's own answer, not a guess about it.
 *
 * These reads are only meaningful while the panel is mounted and only accurate immediately after
 * it was drawn, so a caller takes them inside a discovery pass and treats the result as a
 * snapshot. Prices age slowly; affordability does not, and must be recomputed against live
 * holdings rather than read from the `cna` class.
 */

export interface DrawnAction {
  /** The id the game gave the element, e.g. `tech-mining`. */
  readonly id: string;
  /** `data-<Resource>` costs, keyed by the game's resource names. */
  readonly cost: Readonly<Record<string, number>>;
}

export interface GameDrawnActionsReader {
  /** Action elements currently matching `selector`, in document order. */
  read(selector: string): readonly Readonly<DrawnAction>[];
  /**
   * Whether anything matches `selector` right now. Answers "is this panel drawn" without paying to
   * read what is in it, which is what decides whether a panel has to be drawn at all.
   */
  exists(selector: string): boolean;
}
