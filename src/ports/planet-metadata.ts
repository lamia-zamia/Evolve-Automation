/**
 * Reading a generated planet's metadata from what the game drew.
 *
 * The biome, traits, orbit and geology of a generated planet live in `setPlanet`'s closure — not
 * in `global` — so the only game-owned answer is the row the game rendered plus the popover it
 * builds on hover (`planetDesc` in `src/actions.js`). That popover is the game's own computation,
 * including the `miners_dream` / `lamentis` reveal rule applied to each deposit, so reading it is
 * cheaper and more faithful than re-running the generator.
 *
 * Every field here is text or a class the game wrote. Turning it back into ids is the evolve
 * adapter's job, and it fails closed when a value does not parse.
 */

export interface DrawnPlanetGeologyRow {
  /** The resource name the game printed, before the colon. */
  readonly label: string;
  /** `has-text-advanced` (a bonus deposit) rather than `has-text-caution` (a malus one). */
  readonly beneficial: boolean;
  /**
   * The exact percentage the game revealed for this deposit, or `undefined` where it printed the
   * "Bonus"/"Malus" word instead. Which rows get a number is the game's own reveal budget.
   */
  readonly percent: number | undefined;
}

export interface DrawnPlanetDetail {
  readonly elementId: string;
  /** The row's `.aTitle`: trait labels, then the biome label, then the generated number. */
  readonly title: string;
  /** The popover's first line, which carries the orbital period. */
  readonly summary: string;
  /** One entry per `.pGeo` row, in the order the game rendered them. */
  readonly geology: readonly DrawnPlanetGeologyRow[];
}

export interface PlanetMetadataReader {
  /**
   * Opens the row's popover, reads it, and closes it again. `undefined` when the row or its
   * popover is not there — which a caller must treat as "cannot rank", never as "no metadata".
   */
  readPlanetDetail(elementId: string): DrawnPlanetDetail | undefined;
}
