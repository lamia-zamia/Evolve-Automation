import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planMarketBuy,
  planMarketSell,
  type MarketDecision,
} from "../domain/market.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type { MarketReader, TradeRouteAdjuster } from "../ports/market.ts";

export interface MarketAutomationDependencies {
  readonly reader: MarketReader;
  readonly executor: DecisionExecutor<MarketDecision>;
  readonly tradeRoutes: TradeRouteAdjuster;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runMarketAutomation(
  dependencies: MarketAutomationDependencies,
  bulkSell = false,
  ignoreSellRatio = false,
): CommandExecutionOutcome {
  const gate = dependencies.reader.readGate();
  if (!gate.unlocked) {
    return SUCCEEDED;
  }
  dependencies.tradeRoutes.adjust();
  if (gate.noTrade) {
    return SUCCEEDED;
  }

  const session = dependencies.reader.readSession();
  let outcome: CommandExecutionOutcome = SUCCEEDED;
  for (let index = 0; ; index++) {
    const sellInput = dependencies.reader.readSell(index, ignoreSellRatio);
    if (sellInput === null) {
      break;
    }
    const sell = planMarketSell(sellInput);
    if (sell !== null) {
      outcome = dependencies.executor.execute(sell);
      if (outcome.status !== "succeeded") {
        break;
      }
    }
    if (bulkSell === true || !sellInput.eligible) {
      continue;
    }
    const buy = planMarketBuy(
      dependencies.reader.readBuy(index, session.minimumMoneyAllowed),
    );
    if (buy !== null) {
      outcome = dependencies.executor.execute(buy);
      if (outcome.status !== "succeeded") {
        break;
      }
    }
  }

  const restore = dependencies.executor.execute({
    kind: "restore-multiplier",
    multiplier: session.originalMultiplier,
  });
  return outcome.status === "succeeded" ? restore : outcome;
}
