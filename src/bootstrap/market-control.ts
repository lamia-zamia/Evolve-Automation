import {
  createMarketCommandExecutor,
  createMarketReader,
  type MarketReaderDependencies,
} from "../adapters/evolve/economy/market/market.ts";
import { runMarketAutomation } from "../application/market.ts";
import type { TickDiagnostics } from "../ports/tick.ts";

// Composition seam for the market slice: the runtime forwards the `bulkSell` and
// `ignoreSellRatio` arguments per call, so the reader/executor are constructed
// per invocation, matching the runtime's prior behavior.
export function createMarketControl(dependencies: {
  reader: MarketReaderDependencies;
  executor: Pick<MarketReaderDependencies, "getManager" | "getResources">;
  tradeRoutes: { readonly adjust: () => void };
  diagnostics?: TickDiagnostics | undefined;
}) {
  return Object.freeze({
    autoMarket: (bulkSell?: boolean, ignoreSellRatio?: boolean) =>
      runMarketAutomation(
        {
          reader: createMarketReader(dependencies.reader),
          executor: createMarketCommandExecutor(dependencies.executor),
          tradeRoutes: dependencies.tradeRoutes,
          diagnostics: dependencies.diagnostics,
        },
        bulkSell,
        ignoreSellRatio,
      ),
  });
}
