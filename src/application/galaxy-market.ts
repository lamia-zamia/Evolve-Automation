import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planGalaxyMarket,
  type GalaxyMarketDecision,
} from "../domain/economy/market/galaxy-market.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type { GalaxyMarketReader } from "../ports/galaxy-market.ts";

export interface GalaxyMarketAutomationDependencies {
  readonly reader: GalaxyMarketReader;
  readonly executor: DecisionExecutor<GalaxyMarketDecision>;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runGalaxyMarketAutomation(
  dependencies: GalaxyMarketAutomationDependencies,
): CommandExecutionOutcome {
  const decision = planGalaxyMarket(dependencies.reader.read());
  return decision === null
    ? SUCCEEDED
    : dependencies.executor.execute(decision);
}
