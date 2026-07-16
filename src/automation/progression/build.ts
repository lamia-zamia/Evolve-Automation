import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  | "getBuildingManager"
  | "getProjectManager"
  | "getState"
  | "getSettings"
  | "getResources"
  | "getGetCostConflict"
>;
export function createAutoBuild({
  getBuildingManager,
  getProjectManager,
  getState,
  getSettings,
  getResources,
  getGetCostConflict,
}: Dependencies) {
  return function autoBuild() {
    const BuildingManager = getBuildingManager();
    const ProjectManager = getProjectManager();
    const state = getState();
    const settings = getSettings();
    const resources = getResources();
    const getCostConflict = getGetCostConflict();
    BuildingManager.updateWeighting();
    ProjectManager.updateWeighting();

    let ignoredList = [...state.queuedTargets, ...state.triggerTargets];
    let buildingList = [
      ...BuildingManager.managedPriorityList(),
      ...ProjectManager.managedPriorityList(),
    ];

    // Sort array so we'll have prioritized buildings on top. We'll need that below to avoid deathlocks, when building 1 waits for building 2, and building 2 waits for building 3. That's something we don't want to happen when building 1 and building 3 doesn't conflicts with each other.
    state.unlockedBuildings = buildingList.sort(
      (a, b) => b.weighting - a.weighting,
    );

    let estimatedTime = {};
    let affordableCache = {};
    let consumptionsUsed = {};
    const isAffordable = (building) =>
      affordableCache[building._vueBinding] ??
      (affordableCache[building._vueBinding] = building.isAffordable());
    const usesUsedConsumption =
      settings.buildingConsumptionCheck === "perResource"
        ? (building) =>
            building.consumption.some(
              (c) => c.rate >= 0 && consumptionsUsed[c.resource._id],
            )
        : settings.buildingConsumptionCheck === "unlimited"
          ? (building) => false
          : // onePerTick or any invalid A?B type override
            (building) => Object.keys(consumptionsUsed).length > 0;

    // Loop through the auto build list and try to buy them
    buildingsLoop: for (let i = 0; i < buildingList.length; i++) {
      let building = buildingList[i];

      // Only go further if it's affordable building, and not current target
      if (ignoredList.includes(building) || !isAffordable(building)) {
        continue;
      }

      // Results of buying multiple things using the same consumption/support in one tick are often bad
      if (usesUsedConsumption(building)) {
        continue;
      }

      // Check queue and trigger conflicts
      let conflict = getCostConflict(building);
      if (conflict && !building.is.important) {
        building.extraDescription +=
          conflict.status === "unavailable"
            ? "Cost reservation data unavailable; skipped for safety<br>"
            : `Conflicts with ${conflict.targetNames
                .map((action) => {
                  return `<span class="has-text-info">${action}</span>`;
                })
                .join(", ")} for ${conflict.resourceNames
                .map((res) => {
                  return `<span class="has-text-info">${res}</span>`;
                })
                .join(", ")} (${conflict.targetCause})<br>`;
        continue;
      }

      // Checks weights, if this building doesn't demands any overflowing resources(unless we ignoring overflowing)
      if (
        !settings.buildingBuildIfStorageFull ||
        !Object.keys(building.cost).some(
          (res) => resources[res].storageRatio > 0.98,
        )
      ) {
        for (let j = 0; j < buildingList.length; j++) {
          let other = buildingList[j];
          let weightDiffRatio = other.weighting / building.weighting;

          // Buildings sorted by weighting, so once we reached something with lower weighting - all remaining also lower, and we don't care about them
          if (weightDiffRatio <= 1.000001) {
            break;
          }
          // And we don't want to process clickable buildings - all buildings with highter weighting should already been proccessed.
          // If that thing is affordable, but wasn't bought - it means something block it, and it won't be builded soon anyway, so we'll ignore it's demands.
          // Unless that thing have x10 weight, and we absolutely don't want to waste its resources
          if (weightDiffRatio < 10 && isAffordable(other)) {
            continue;
          }

          // Calculate time to build for competing building, if it's not cached
          let estimation = estimatedTime[other._vueBinding];
          if (!estimation) {
            estimation = [];

            for (let res in other.cost) {
              let resource = resources[res];
              let quantity = other.cost[res];

              // Ignore locked
              if (!resource.isUnlocked()) {
                continue;
              }

              let totalRateOfCharge = resource.rateOfChange;
              if (totalRateOfCharge > 0) {
                estimation[resource.id] =
                  (quantity - resource.currentQuantity) / totalRateOfCharge;
              } else if (
                settings.buildingsIgnoreZeroRate &&
                resource.storageRatio < 0.975 &&
                resource.currentQuantity < quantity
              ) {
                estimation[resource.id] = Number.MAX_SAFE_INTEGER;
              } else {
                // Craftables and such, which not producing at this moment. We can't realistically calculate how much time it'll take to fulfil requirement(too many factors), so let's assume we can get it any any moment.
                estimation[resource.id] = 0;
              }
            }
            estimation.total = Math.max(
              0,
              ...(Object.values(estimation) as number[]),
            );
            estimatedTime[other._vueBinding] = estimation;
          }

          // Compare resource costs
          for (let res in building.cost) {
            let resource = resources[res];
            let thisQuantity = building.cost[res];

            // Ignore locked and capped resources
            if (
              !resource.isUnlocked() ||
              (resource.storageRatio > 0.99 &&
                resource.currentQuantity >= resource.storageRequired)
            ) {
              continue;
            }

            // Check if we're actually conflicting on this resource
            let otherQuantity = other.cost[res];
            if (otherQuantity === undefined) {
              continue;
            }

            // We have enought resources for both buildings, no need to preserve it
            if (resource.currentQuantity >= otherQuantity + thisQuantity) {
              continue;
            }

            // We can use up to this amount of resources without delaying competing building
            // Not very accurate, as income can fluctuate wildly for foundry, factory, and such, but should work as bottom line
            if (
              thisQuantity <=
              (estimation.total - estimation[resource.id]) *
                resource.rateOfChange
            ) {
              continue;
            }

            // Check if cost difference is below weighting threshold, so we won't wait hours for 10x amount of resources when weight is just twice higher
            let costDiffRatio = otherQuantity / thisQuantity;
            if (costDiffRatio >= weightDiffRatio) {
              continue;
            }

            // If we reached here - then we want to delay with our current building. Return all way back to main loop, and try to build something else
            building.extraDescription += `Conflicts with <span class="has-text-info">${other.title}</span> for <span class="has-text-info">${resource.name}</span><br>`;
            continue buildingsLoop;
          }
        }
      }

      // Build building
      if (building.click()) {
        // Same for gems when we're saving them, and missions as they tends to unlock new stuff
        if (
          building.isMission() ||
          (building.cost["Soul_Gem"] &&
            settings.prestigeType === "whitehole" &&
            settings.prestigeWhiteholeSaveGems)
        ) {
          return;
        }
        // Only one building with consumption per tick, so we won't build few red buildings having just 1 extra support, and such
        // Buildings that add support (negative rate) don't count
        building.consumption.forEach((c) => {
          if (c.rate >= 0) {
            consumptionsUsed[c.resource._id] = true;
          }
        });
        // Mark all processed building as unaffordable for remaining loop, so they won't appear as conflicting
        for (let key in affordableCache) {
          affordableCache[key] = false;
        }
      }
    }
  };
}
