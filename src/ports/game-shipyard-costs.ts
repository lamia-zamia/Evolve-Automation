/**
 * What the Dwarf Shipyard charges for a ship.
 *
 * The yard never quotes a price anywhere else: `updateCosts()` prices the live blueprint with the
 * module-private `shipCosts()`, asks `actionPool(shipyardPayer())` which supply pool pays it, colours
 * every resource against `poolHeld(resource, pool)`, and writes the whole answer into `#shipYardCosts`
 * as `data-pool`, one `res-<resource>` span per cost carrying the exact amount and the game's own
 * current-stock verdict. That row is the only authority here, because it is the only surface that
 * already holds both halves of the question — what the design costs, and whether the yard can pay it
 * right now from the pool it will actually draw on.
 *
 * Nothing here is a price this script computed. A caller that cannot be handed one of these must
 * fail closed rather than fall back to an arithmetic answer of its own.
 */
export interface ShipyardCostAmount {
  readonly resourceId: string;
  /** The exact figure the game wrote, not one this script derived. */
  readonly amount: number;
  /**
   * Whether the game marked this resource currently payable, read from its own success marking on the
   * row. It accounts for the active regional supply pool, which the global resource amount does not.
   */
  readonly affordable: boolean;
}

export interface ShipyardCostSample {
  /** The supply pool that pays this cost, when the game named one. */
  readonly pool: string | undefined;
  readonly amounts: readonly ShipyardCostAmount[];
}

export interface GameShipyardCosts {
  /**
   * The game's price for the blueprint the yard is holding now. Passive whenever the game is
   * rendering its own cost row; otherwise the design is priced and put back inside this call.
   */
  current(): ShipyardCostSample | undefined;
  /**
   * The game's price for `blueprint`, which need not be the one applied — this is what lets a
   * candidate be priced before it is permanently written. `undefined` when the game cannot be asked
   * without leaving the yard's blueprint changed.
   */
  price(
    blueprint: Readonly<Record<PropertyKey, unknown>>,
  ): ShipyardCostSample | undefined;
}
