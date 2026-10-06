/** Semantic Building offers from captured native structure definitions and the current root. */

/** One building row's rendered power switch. */
export interface BuildingSwitchState {
  /** Copies switched on. */
  readonly on: number;
  /** Copies switched off, which the game sizes against the switch's own cap. */
  readonly off: number;
}

/** Offered Building ids and the requested regions the sample can answer. */
export interface BuildingUnlockSample {
  /** Automation-owned native action ids currently offered, e.g. `city-farm`. */
  readonly unlocked: ReadonlySet<string>;
  /**
   * The requested region keys whose native availability reads were valid. An unavailable native
   * action is absent from `unlocked`; a region with an invalid or unjoined action is absent here.
   */
  readonly regions: ReadonlySet<string>;
  /** Offered structures whose native definition reports a switch, independent of control capture. */
  readonly switches: ReadonlySet<string>;
  /**
   * The live switch counts for offered structures whose captured native capability has a switch.
   * Switch membership uses `switchable()` or `powered` with `high_tech >= 2` and native power
   * requirements; a missing control or unreadable `on_cap()` omits only that structure's counts.
   * The off count remains the game's own `on_cap() - on`, including segmented megastructures.
   *
   * These are live figures, restated from the current root and captured `on_cap`. They do not
   * determine offer membership; see `BuildingUnlockCatalog`.
   */
  readonly states: ReadonlyMap<string, Readonly<BuildingSwitchState>>;
}

/**
 * Where one switchable building keeps its live state under the game root.
 *
 * The captured native entry supplies the root region and structure key. An action binding can
 * carry a different prefix: under a cataclysm start, `space-nanite_factory` addresses
 * `global.city.nanite_factory`. The full native `entryKey` joins that state to its action, so a
 * short structure name or a missing rendered control cannot invent an address.
 */
export interface BuildingStateAddress {
  /** The game-root key holding the region record, after `setAction`'s normalization. */
  readonly region: string;
  /** The native structure key within that root region. */
  readonly type: string;
}

/**
 * The semantic offer set read from retained native actions. Each requested region is established
 * only when every automation-owned action in it joins captured mechanics and returns a valid
 * availability answer. A valid false is unavailable; invalid or missing authority leaves that
 * region unanswered.
 *
 * Power state is deliberately separate. `on` comes from the current root, while the switch
 * ceiling remains the native control's `on_cap()`.
 */
export interface BuildingUnlockCatalog {
  /** Native action ids currently offered in the sampled regions. */
  readonly unlocked: ReadonlySet<string>;
  /** The requested region keys whose semantic catalog was valid. */
  readonly regions: ReadonlySet<string>;
  /**
   * The offered native structures with a readable switch capability, mapped to their root state.
   * An entry absent here has no readable switch, which is different from being switched off.
   */
  readonly switches: ReadonlyMap<string, Readonly<BuildingStateAddress>>;
}

export interface GameBuildingUnlockCatalogReader {
  /**
   * Reads retained native availability for the requested regions, or returns `undefined` when none
   * could be answered. It does not discover tabs or read rendered action rows.
   */
  read(
    regions: ReadonlySet<string>,
  ): Readonly<BuildingUnlockCatalog> | undefined;
}

/** Restates an established catalog's switches against the current root. Discovers nothing. */
export interface GameBuildingSwitchStateReader {
  read(
    catalog: Readonly<BuildingUnlockCatalog>,
  ): ReadonlyMap<string, Readonly<BuildingSwitchState>>;
}

export interface GameBuildingUnlockReader {
  /**
   * The established semantic offer set for compatible requested regions with live switch counts,
   * or `undefined` when no compatible sample exists.
   */
  read(
    regions: ReadonlySet<string>,
  ): Readonly<BuildingUnlockSample> | undefined;
}
