/**
 * What the game charges to build one crate.
 *
 * Transcribed from Evolve's own `crate()`: the resource is Chrysotile for a smoldering race, Stone
 * for kindling_kindred, and Plywood otherwise — and `iron_wood` then overrides all three with
 * Lumber, on its own and regardless of any other trait. The price is 200 whenever any of those
 * three traits is present and 10 only for the plain Plywood case.
 *
 * Containers are not here: the game charges 125 Steel for one unconditionally.
 */

export interface CrateCostRace {
  readonly smoldering: boolean;
  readonly kindlingKindred: boolean;
  readonly ironWood: boolean;
}

export type CrateCost = Readonly<Record<string, number>>;

export function crateCost(race: CrateCostRace): CrateCost {
  if (race.ironWood) {
    return Object.freeze({ Lumber: 200 });
  }
  if (race.smoldering) {
    return Object.freeze({ Chrysotile: 200 });
  }
  if (race.kindlingKindred) {
    return Object.freeze({ Stone: 200 });
  }
  return Object.freeze({ Plywood: 10 });
}
