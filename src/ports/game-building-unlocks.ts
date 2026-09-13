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
   *
   * These are live figures, restated every cycle from the game root and the captured `on_cap`.
   * They are not part of what a draw answers and never hold a panel open — see
   * `BuildingUnlockCatalog`.
   */
  readonly states: ReadonlyMap<string, Readonly<BuildingSwitchState>>;
}

/**
 * Where one switchable building keeps its live state under the game root.
 *
 * `setAction` takes a row's element id from the action definition but reads its state from
 * `global[action][type]` after normalizing `action`: the outer-system tab becomes `space`, the
 * cave-perk tab becomes `underground`, and a definition carrying its own `region` overrides both.
 * Under a cataclysm start the nanite factory is drawn as `space-nanite_factory` and kept in
 * `global.city.nanite_factory`, so splitting the element id would address the wrong record for
 * exactly the buildings whose region moved. The two keys here are recovered during the draw and
 * are plain strings, so they still name the right record after the game replaces its root.
 */
export interface BuildingStateAddress {
  /** The game-root key holding the region record, after `setAction`'s normalization. */
  readonly region: string;
  /** The key within that record, which is the `type` the game drew the row for. */
  readonly type: string;
}

/**
 * The half of a building sample that only a panel draw can answer.
 *
 * Which buildings are on offer comes from `checkRequirements`, `checkTechQualifications` and a
 * per-building `condition()`, none of which is reachable from captured state — the drawn rows are
 * the answer, and getting them costs a `loadTab`. That set moves with progression and nothing
 * else, so it is cached against the progression epoch rather than re-drawn every cycle.
 *
 * Power state is deliberately *not* here. `on` is a live field of the game's own state record and
 * the switch's ceiling is the component's own `on_cap()`, both readable without drawing anything,
 * so a cycle that only wants to know how many copies are running pays nothing.
 */
export interface BuildingUnlockCatalog {
  /** Element ids drawn across the sampled regions, e.g. `city-farm`. */
  readonly unlocked: ReadonlySet<string>;
  /** The region keys that were drawn and read; see `BuildingUnlockSample.regions`. */
  readonly regions: ReadonlySet<string>;
  /**
   * The rows the game drew a `span.on`/`span.off` pair onto, mapped to where their state lives.
   * A row absent here has no power switch, which is a different answer from one that is off.
   */
  readonly switches: ReadonlyMap<string, Readonly<BuildingStateAddress>>;
}

export interface GameBuildingUnlockCatalogReader {
  /**
   * Draws and reads each requested region, or returns `undefined` when none could be sampled.
   * Region keys are the first half of a building action id: `city`, `space`, `interstellar`,
   * `galaxy`, `portal`, `tauceti`, `eden`.
   */
  read(
    regions: ReadonlySet<string>,
  ): Readonly<BuildingUnlockCatalog> | undefined;
}

/** Restates a cached catalog's switches against the current root. Draws nothing. */
export interface GameBuildingSwitchStateReader {
  read(
    catalog: Readonly<BuildingUnlockCatalog>,
  ): ReadonlyMap<string, Readonly<BuildingSwitchState>>;
}

export interface GameBuildingUnlockReader {
  /**
   * The cached offer set for each requested region with live switch counts restated onto it, or
   * `undefined` when no region could be sampled.
   */
  read(
    regions: ReadonlySet<string>,
  ): Readonly<BuildingUnlockSample> | undefined;
}
