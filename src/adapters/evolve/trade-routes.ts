import { planTradeRoutes } from "../../domain/economy/market/trade-routes.ts";
import { readTradeRoutesInput } from "./economy/market/trade-routes.ts";

interface TradeResource {
  rateOfChange: number;
}

interface TradeMarketManager {
  zeroTradeRoutes(resource: TradeResource): void;
  addTradeRoutes(resource: TradeResource, count: number): void;
  removeTradeRoutes(resource: TradeResource, count: number): void;
}

interface TradeRoutesDependencies {
  readonly getSettings: () => unknown;
  readonly getGame: () => unknown;
  readonly getResources: () => Record<string, TradeResource>;
  readonly getMarketManager: () => TradeMarketManager;
  readonly getGovernor: () => unknown;
  readonly shouldSaveInflationMoney: () => boolean;
}

export interface TradeRoutes {
  adjustTradeRoutes(): void;
}

export function createTradeRoutes({
  getSettings,
  getGame,
  getResources,
  getMarketManager,
  getGovernor,
  shouldSaveInflationMoney,
}: TradeRoutesDependencies): TradeRoutes {
  function adjustTradeRoutes(): void {
    const result = planTradeRoutes(
      readTradeRoutesInput({
        getSettings,
        getGame,
        getResources,
        getMarketManager,
        getGovernor,
        shouldSaveInflationMoney,
      }),
    );
    const resources = getResources();
    const marketManager = getMarketManager();
    for (const operation of result.operations) {
      const resource = resources[operation.resourceId]!;
      if (operation.kind === "zero") {
        marketManager.zeroTradeRoutes(resource);
      } else if (operation.kind === "add") {
        marketManager.addTradeRoutes(resource, operation.count);
      } else {
        marketManager.removeTradeRoutes(resource, operation.count);
      }
    }
    resources.Money!.rateOfChange = result.moneyRate;
  }

  return { adjustTradeRoutes };
}
