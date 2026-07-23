import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { planBattle, prepareBattle } from "../domain/combat/battle.ts";
import type { BattleExecutor, BattleReader } from "../ports/battle.ts";

export interface BattleAutomationDependencies {
  readonly reader: BattleReader;
  readonly executor: BattleExecutor;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runBattleAutomation(
  dependencies: BattleAutomationDependencies,
): CommandExecutionOutcome {
  const parameters = prepareBattle(dependencies.reader.readCycle());
  if (parameters === null) return SUCCEEDED;
  const decision = planBattle(
    parameters,
    dependencies.reader.readBattlefield(parameters),
  );
  return decision === null
    ? SUCCEEDED
    : dependencies.executor.execute(decision);
}
