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

/** One building row's rendered power switch. */
export interface BuildingSwitchState {
  /** Copies switched on. */
  readonly on: number;
  /** Copies switched off, which the game sizes against the switch's own cap. */
  readonly off: number;
}

/** The drawn building ids, and the regions the sample can actually speak for. */
export interface BuildingUnlockSample {
  /** Element ids drawn across the sampled regions, e.g. `city-farm`. */
  readonly unlocked: ReadonlySet<string>;
  /**
   * The region keys that were drawn and read. A region whose pass failed is absent, which keeps
   * "the panel said no" distinct from "the panel was never read".
   */
  readonly regions: ReadonlySet<string>;
  /**
   * The on/off counts for the drawn rows that rendered a power switch, by element id. Whether a
   * building has a switch at all is decided by `switchable()`, or by `powered` with
   * `high_tech >= 2` and `checkPowerRequirements` — all of them reads of the module-lexical
   * definition — and the game answers it by drawing the two spans or not drawing them, so a row
   * in a sampled region that is absent here has no switch to report. The off count is the
   * game's own `on_cap() - on`, which is the built count for an ordinary building and 1 for a
   * segmented megastructure that is a single machine.
   */
  readonly states: ReadonlyMap<string, Readonly<BuildingSwitchState>>;
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
