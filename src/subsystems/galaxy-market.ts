import type { SubsystemDependencies } from "./types.ts";

type Dependencies = SubsystemDependencies<
  | "getGalaxyTradeManager"
  | "getPoly"
  | "getResources"
  | "getSettings"
>;
export function createAutoGalaxyMarket({ getGalaxyTradeManager, getPoly, getResources, getSettings }: Dependencies) {
  return function autoGalaxyMarket() {
    const GalaxyTradeManager = getGalaxyTradeManager();
    const poly = getPoly();
    const resources = getResources();
    const settings = getSettings();
    // If not unlocked then nothing to do
    if (!GalaxyTradeManager.initIndustry()) {
      return;
    }

    // Init adjustment, and sort groups by priorities
    let priorityGroups = {};
    let tradeAdjustments = {};
    for (let i = 0; i < poly.galaxyOffers.length; i++) {
      let trade = poly.galaxyOffers[i];
      let buyResource = resources[trade.buy.res];
      if (buyResource.galaxyMarketWeighting > 0) {
        let priority = buyResource.isDemanded()
          ? Math.max(buyResource.galaxyMarketPriority, 100)
          : buyResource.galaxyMarketPriority;
        if (priority !== 0) {
          priorityGroups[priority] = priorityGroups[priority] ?? [];
          priorityGroups[priority].push(trade);
        }
      }
      tradeAdjustments[buyResource.id] = 0;
    }
    let priorityList = (Object.keys(priorityGroups) as any[])
      .sort((a, b) => b - a)
      .map((key) => priorityGroups[key]);
    if (priorityGroups["-1"] && priorityList.length > 1) {
      priorityList.splice(priorityList.indexOf(priorityGroups["-1"], 1));
      priorityList[0].push(...priorityGroups["-1"]);
    }

    // Calculate amount of factories per product
    let remainingFreighters = GalaxyTradeManager.maxOperating();
    for (let i = 0; i < priorityList.length && remainingFreighters > 0; i++) {
      let trades = priorityList[i].sort(
        (a, b) =>
          resources[a.buy.res].galaxyMarketWeighting -
          resources[b.buy.res].galaxyMarketWeighting,
      );
      while (remainingFreighters > 0) {
        let freightersToDistribute = remainingFreighters;
        let totalPriorityWeight = trades.reduce(
          (sum, trade) => sum + resources[trade.buy.res].galaxyMarketWeighting,
          0,
        );

        for (
          let j = trades.length - 1;
          j >= 0 && remainingFreighters > 0;
          j--
        ) {
          let trade = trades[j];
          let buyResource = resources[trade.buy.res];
          let sellResource = resources[trade.sell.res];

          let calculatedRequiredFreighters = Math.min(
            remainingFreighters,
            Math.max(
              1,
              Math.floor(
                (freightersToDistribute / totalPriorityWeight) *
                  buyResource.galaxyMarketWeighting,
              ),
            ),
          );
          let actualRequiredFreighters = calculatedRequiredFreighters;
          if (
            !buyResource.isUseful() ||
            sellResource.isDemanded() ||
            sellResource.storageRatio < settings.marketMinIngredients
          ) {
            actualRequiredFreighters = 0;
          }

          if (actualRequiredFreighters > 0) {
            remainingFreighters -= actualRequiredFreighters;
            tradeAdjustments[buyResource.id] += actualRequiredFreighters;
          }

          // We assigned less than wanted, i.e. we either don't need this product, or can't afford it. In both cases - we're done with it.
          if (actualRequiredFreighters < calculatedRequiredFreighters) {
            trades.splice(j, 1);
          }
        }

        if (freightersToDistribute === remainingFreighters) {
          break;
        }
      }
    }

    let tradeDeltas = poly.galaxyOffers.map(
      (trade, index) =>
        tradeAdjustments[trade.buy.res] -
        GalaxyTradeManager.currentProduction(index),
    );

    // TODO: Add GalaxyTradeManager.zeroProduction() to save some clicks.
    tradeDeltas.forEach(
      (value, index) =>
        value < 0 && GalaxyTradeManager.decreaseProduction(index, value * -1),
    );
    tradeDeltas.forEach(
      (value, index) =>
        value > 0 && GalaxyTradeManager.increaseProduction(index, value),
    );
  }
}
