export function legacyCheckAffordableCustom(cost, resources, maximum = false) {
  const check = maximum ? "maxQuantity" : "currentQuantity";
  for (const resourceId in cost) {
    if (
      !resources[resourceId] ||
      resources[resourceId][check] < cost[resourceId]
    ) {
      return false;
    }
  }
  return true;
}
