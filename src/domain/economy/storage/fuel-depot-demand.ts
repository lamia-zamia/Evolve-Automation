import type { StorageRequestTarget } from "./storage-requirements.ts";

export interface FuelDepotDemandInput {
  /** Still-pending techs and missions, in any order; only their costs matter. */
  readonly targets: readonly StorageRequestTarget[];
}

/**
 * Max cost per resource across still-pending techs and missions.
 *
 * The fuel-depot building weighting ("Missing Oil or Helium for techs and missions")
 * consumes this rather than the resource's broad `maxCost`. `maxCost` is the largest
 * cost across every autobuild target — techs, missions, buildings, projects, fleet ships —
 * because storage must be sized for the most expensive thing that could be built. Reusing
 * it for the fuel weighting kept fuel depots boosted whenever any late-game building or
 * project cost more Oil/Helium than current storage, even with no fuel-gated tech or mission
 * left. This narrows the weighting to what its label always claimed: techs and missions.
 */
export function planFuelDepotDemand(
  input: FuelDepotDemandInput,
): ReadonlyMap<string, number> {
  const maxCost = new Map<string, number>();
  for (const target of input.targets) {
    for (const cost of target.costs) {
      const previous = maxCost.get(cost.resourceId) ?? 0;
      if (cost.amount > previous) {
        maxCost.set(cost.resourceId, cost.amount);
      }
    }
  }
  return maxCost;
}
