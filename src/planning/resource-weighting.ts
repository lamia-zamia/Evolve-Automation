interface WeightedBuilding {
  cost: Record<string, number>;
  weighting: number;
}

interface ResourceWeightingDependencies {
  getState: () => { unlockedBuildings: WeightedBuilding[] };
}

export function createResourceWeighting({
  getState,
}: ResourceWeightingDependencies) {
  function findRequiredResourceWeight(resource: {
    id: string;
    currentQuantity: number;
  }) {
    return getState().unlockedBuildings.find(
      (building) => building.cost[resource.id] > resource.currentQuantity,
    )?.weighting;
  }

  return { findRequiredResourceWeight };
}
