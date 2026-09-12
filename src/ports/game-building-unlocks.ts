/**
 * Which buildings the game is currently offering, read from the panels it draws them into.
 *
 * A building's unlock state has no captured route through game state: the offer rules live in the
 * module-lexical action catalogs and the per-building gate — `checkRequirements` plus
 * `checkTechQualifications` — reads a `condition()` closure, trait, gene and `not_tech` fields
 * that nothing exposes. What the game does expose is the result: `setAction` appends a
 * `<div id="<region>-<id>" class="action">` to its region's container for exactly the buildings
 * that passed, so the drawn rows are the game's own answer.
 *
 * Unlike research, a building row stays drawn once it is built — nothing in the draw path removes
 * or skips a row for having a count — so an id missing from a sampled region means "not offered",
 * never "already finished".
 *
 * Regions are sampled, not assumed. Each one is behind its own sub-tab and costs a pass to draw,
 * so a caller asks for the regions it actually needs and an operand naming any other region goes
 * unanswered rather than being read as locked.
 */

/** The drawn building ids, and the regions the sample can actually speak for. */
export interface BuildingUnlockSample {
  /** Element ids drawn across the sampled regions, e.g. `city-farm`. */
  readonly unlocked: ReadonlySet<string>;
  /**
   * The region keys that were drawn and read. A region whose pass failed is absent, which keeps
   * "the panel said no" distinct from "the panel was never read".
   */
  readonly regions: ReadonlySet<string>;
}

export interface GameBuildingUnlockReader {
  /**
   * Draws and reads each requested region, or returns `undefined` when none could be sampled.
   * Region keys are the first half of a building action id: `city`, `space`, `interstellar`,
   * `galaxy`, `portal`, `tauceti`, `eden`.
   */
  read(
    regions: ReadonlySet<string>,
  ): Readonly<BuildingUnlockSample> | undefined;
}
