import { createTradeRoutes } from "../adapters/evolve/trade-routes.ts";

type TradeRouteDependencies = Parameters<typeof createTradeRoutes>[0];

export type TradeRouteControlDependencies = TradeRouteDependencies;

export function createTradeRouteControl(
  dependencies: TradeRouteControlDependencies,
) {
  return createTradeRoutes(dependencies);
}
