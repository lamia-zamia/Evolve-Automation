import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  | "getMarketManager"
  | "getGame"
  | "getResources"
  | "getSettings"
  | "getAdjustTradeRoutes"
  | "ticksPerSecond"
>;
export function createAutoMarket({
  getMarketManager,
  getGame,
  getResources,
  getSettings,
  getAdjustTradeRoutes,
  ticksPerSecond,
}: Dependencies) {
  return function autoMarket(bulkSell, ignoreSellRatio) {
    const MarketManager = getMarketManager();
    const game = getGame();
    const resources = getResources();
    const settings = getSettings();
    const adjustTradeRoutes = getAdjustTradeRoutes();
    if (!MarketManager.isUnlocked()) {
      return;
    }

    adjustTradeRoutes();

    // Manual trade disabled
    if (game.global.race["no_trade"]) {
      return;
    }

    let minimumMoneyAllowed = Math.max(
      (resources.Money.maxQuantity * settings.minimumMoneyPercentage) / 100,
      settings.minimumMoney,
    );

    let currentMultiplier = MarketManager.multiplier; // Save the current multiplier so we can reset it at the end of the function
    let maxMultiplier = MarketManager.getMaxMultiplier();

    for (let i = 0; i < MarketManager.priorityList.length; i++) {
      let resource = MarketManager.priorityList[i];

      if (
        !resource.is.tradable ||
        !resource.isUnlocked() ||
        !MarketManager.isBuySellUnlocked(resource)
      ) {
        continue;
      }

      if (
        resource.autoSellEnabled &&
        (ignoreSellRatio || resource.storageRatio >= resource.autoSellRatio)
      ) {
        let maxAllowedTotalSellPrice =
          resources.Money.maxQuantity - resources.Money.currentQuantity;
        let unitSellPrice = MarketManager.getUnitSellPrice(resource);
        let maxAllowedUnits = Math.floor(
          maxAllowedTotalSellPrice / unitSellPrice,
        ); // only sell up to our maximum money

        if (resource.storageRatio > resource.autoSellRatio) {
          maxAllowedUnits = Math.min(
            maxAllowedUnits,
            Math.floor(
              resource.currentQuantity -
                resource.autoSellRatio * resource.maxQuantity,
            ),
          ); // If not full sell up to our sell ratio
        } else {
          maxAllowedUnits = Math.min(
            maxAllowedUnits,
            Math.floor((resource.income * 2) / ticksPerSecond()),
          ); // If resource is full then sell up to 2 ticks worth of production
        }

        if (maxAllowedUnits <= maxMultiplier) {
          // Our current max multiplier covers the full amount that we want to sell
          MarketManager.setMultiplier(maxAllowedUnits);
          MarketManager.sell(resource);
        } else {
          // Our current max multiplier doesn't cover the full amount that we want to sell. Sell up to 5 batches.
          let counter = Math.min(
            5,
            Math.floor(maxAllowedUnits / maxMultiplier),
          ); // Allow up to 5 sales per script loop
          MarketManager.setMultiplier(maxMultiplier);

          for (let j = 0; j < counter; j++) {
            MarketManager.sell(resource);
          }
        }
      }

      if (bulkSell === true) {
        continue;
      }

      if (
        resource.autoBuyEnabled === true &&
        resource.storageRatio < resource.autoBuyRatio &&
        !resources.Money.isDemanded()
      ) {
        let storableAmount = Math.floor(
          (resource.autoBuyRatio - resource.storageRatio) *
            resource.maxQuantity,
        );
        let affordableAmount = Math.floor(
          (resources.Money.currentQuantity - minimumMoneyAllowed) /
            MarketManager.getUnitBuyPrice(resource),
        );
        let maxAllowedUnits = Math.min(storableAmount, affordableAmount);
        if (maxAllowedUnits > 0) {
          if (maxAllowedUnits <= maxMultiplier) {
            MarketManager.setMultiplier(maxAllowedUnits);
            MarketManager.buy(resource);
          } else {
            let counter = Math.min(
              5,
              Math.floor(maxAllowedUnits / maxMultiplier),
            );
            MarketManager.setMultiplier(maxMultiplier);

            for (let j = 0; j < counter; j++) {
              MarketManager.buy(resource);
            }
          }
        }
      }
    }

    MarketManager.setMultiplier(currentMultiplier); // Reset multiplier
  };
}
