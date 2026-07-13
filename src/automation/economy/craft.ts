import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  "getResources" | "getGame" | "getFoundryList" | "ticksPerSecond"
>;
export function createAutoCraft({
  getResources,
  getGame,
  getFoundryList,
  ticksPerSecond,
}: Dependencies) {
  return function autoCraft() {
    const resources = getResources();
    const game = getGame();
    const foundryList = getFoundryList();
    if (!resources.Population.isUnlocked()) {
      return;
    }
    if (game.global.race["no_craft"]) {
      return;
    }

    craftLoop: for (let i = 0; i < foundryList.length; i++) {
      let craftable = foundryList[i];
      if (!craftable.isUnlocked() || !craftable.autoCraftEnabled) {
        continue;
      }

      let affordableAmount = Number.MAX_SAFE_INTEGER;
      for (let res in craftable.cost) {
        let resource = resources[res];
        let quantity = craftable.cost[res];

        affordableAmount = Math.min(
          affordableAmount,
          Math.ceil(
            (resource.currentQuantity -
              resource.maxQuantity * craftable.craftPreserve) /
              quantity,
          ),
        );

        if (craftable.isDemanded()) {
          // Craftable demanded, get as much as we can
          let maxUse =
            resource.currentQuantity <
            resource.maxQuantity * (craftable.craftPreserve + 0.05)
              ? resource.currentQuantity
              : resource.spareQuantity;
          affordableAmount = Math.min(affordableAmount, maxUse / quantity);
        } else if (
          resource.isDemanded() ||
          (!resource.isCapped() && resource.usefulRatio < craftable.usefulRatio)
        ) {
          // Don't use demanded resources
          continue craftLoop;
        } else if (craftable.currentQuantity < craftable.storageRequired) {
          // Craftable is required, use all spare resources
          affordableAmount = Math.min(
            affordableAmount,
            resource.spareQuantity / quantity,
          );
        } else if (
          resource.currentQuantity >= resource.storageRequired ||
          resource.isCapped()
        ) {
          // Resource not required - consume income
          affordableAmount = Math.min(
            affordableAmount,
            Math.ceil(resource.rateOfChange / ticksPerSecond() / quantity),
          );
        } else {
          // Resource is required, and craftable not required. Don't craft anything.
          continue craftLoop;
        }
      }
      affordableAmount = Math.floor(affordableAmount);
      if (affordableAmount >= 1) {
        craftable.tryCraftX(affordableAmount);
        for (let res in craftable.cost) {
          resources[res].currentQuantity -=
            craftable.cost[res] * affordableAmount;
        }
      }
    }
  };
}
