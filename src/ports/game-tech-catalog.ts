/**
 * Which technologies the game is currently offering, which it has already granted, and what it
 * charges for the offers.
 *
 * "Offered" is the game's own judgement — path, qualifications and requirements all met, not yet
 * granted — and it has no captured route other than asking the game to draw the research panel.
 * The order is the game's too: era, then ascending Knowledge cost.
 *
 * "Granted" is the other half of the same draw, and it is the only captured answer to whether a
 * technology is complete: the game's grant keys live in its private action catalog, but it renders
 * every already-researched entry under its own element id. That half is much the larger one — a
 * late save has hundreds of granted entries against a handful of offers — so a pass only keeps it
 * when a caller asks, and callers that do not ask must not treat its absence as "nothing granted".
 */

export interface OfferedTech {
  /** The id the game renders the action under, e.g. `tech-mining`. */
  readonly elementId: string;
  /** The game's own current price, keyed by its resource names. */
  readonly cost: Readonly<Record<string, number>>;
  /**
   * The captured-control generation this offer was read from, or 0 when the game drew the action
   * without binding a control for it. Anything acting on the offer checks it against the current
   * generation, because a superseded closure stays callable and looks correct.
   */
  readonly generation: number;
}

export interface TechCatalogReadOptions {
  /**
   * Also report the already-granted set, which costs the larger half of the draw. Omitted or
   * false leaves `granted` absent rather than empty.
   */
  readonly includeGranted?: boolean;
}

export interface TechCatalogSnapshot {
  /** The offered technologies in the game's order. */
  readonly offered: readonly Readonly<OfferedTech>[];
  /**
   * Element ids the game has already granted, present only when the pass was asked for them.
   * Absent means "not read", never "none granted".
   */
  readonly granted?: ReadonlySet<string>;
}

export interface GameTechCatalog {
  /**
   * One pass over the research panel, or `undefined` when it could not be read. Never a stale
   * answer: a catalog that could not be refreshed is no catalog.
   *
   * Each call asks the game afresh. Read it once per application cycle and pass the result down —
   * it describes that cycle and no later one.
   */
  read(
    options?: Readonly<TechCatalogReadOptions>,
  ): Readonly<TechCatalogSnapshot> | undefined;
  /**
   * The same snapshot with everything that lives in game state rather than in the draw taken
   * fresh — here, the captured-control generation of each offer.
   *
   * The game rebinds an action every time it draws the panel, and the capture records that on its
   * own, so a snapshot held across ticks goes stale in its generations and nowhere else. Re-reading
   * them costs a registry lookup per offer; re-drawing the panel to learn the same thing costs a
   * `loadTab`.
   */
  restate(
    snapshot: Readonly<TechCatalogSnapshot>,
  ): Readonly<TechCatalogSnapshot>;
}
