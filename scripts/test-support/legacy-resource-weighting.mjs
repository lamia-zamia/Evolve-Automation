export function legacyFindRequiredResourceWeight(unlockedBuildings, resource) {
  return unlockedBuildings.find(
    (building) => building.cost[resource.id] > resource.currentQuantity,
  )?.weighting;
}
