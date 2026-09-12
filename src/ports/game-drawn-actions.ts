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

/** The on/off counts the game rendered onto a building row that has a power switch. */
export interface DrawnActionState {
  /** Copies switched on, the `span.on` the row renders from `act.on`. */
  readonly on: number;
  /** Copies switched off, the `span.off` the row renders as `on_cap() - act.on`. */
  readonly off: number;
}

export interface DrawnAction {
  /** The id the game gave the element, e.g. `tech-mining`. */
  readonly id: string;
  /** `data-<Resource>` costs, keyed by the game's resource names. */
  readonly cost: Readonly<Record<string, number>>;
  /**
   * The row's rendered on/off counts, when it rendered a pair of them. `setAction` appends the
   * two spans only for an action whose own gate passed — `switchable()` if the definition has
   * one, otherwise `powered` plus `high_tech >= 2` plus `checkPowerRequirements` — and all three
   * of those read the module-lexical definition, so the drawn spans are the captured answer to
   * whether a building has a power state at all. Absent means the game drew no such pair, or
   * drew something that is not a number: the casino and lab rows substitute a holiday string for
   * a zero, which is not a count and is not guessed at.
   */
  readonly state?: Readonly<DrawnActionState>;
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
