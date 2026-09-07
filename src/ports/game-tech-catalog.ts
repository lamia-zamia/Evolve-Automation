/**
 * Which technologies the game is currently offering, and what it charges for them.
 *
 * "Offered" is the game's own judgement — path, qualifications and requirements all met, not yet
 * granted — and it has no captured route other than asking the game to draw the research panel.
 * The order is the game's too: era, then ascending Knowledge cost.
 */

export interface OfferedTech {
  /** The id the game renders the action under, e.g. `tech-mining`. */
  readonly elementId: string;
  /** The game's own current price, keyed by its resource names. */
  readonly cost: Readonly<Record<string, number>>;
}

export interface GameTechCatalog {
  /**
   * The offered technologies in the game's order, or `undefined` when the catalog could not be
   * read. Never a stale answer: a catalog that could not be refreshed is no catalog.
   */
  readOffered(): readonly Readonly<OfferedTech>[] | undefined;
}
