import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planSpyCycle,
  planSpyEspionage,
  planSpyTraining,
} from "../domain/combat/spy.ts";
import type { SpyExecutor, SpyReader } from "../ports/spy.ts";

export interface SpyAutomationDependencies {
  readonly reader: SpyReader;
  readonly executor: SpyExecutor;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runSpyAutomation(
  dependencies: SpyAutomationDependencies,
): CommandExecutionOutcome {
  const cycle = planSpyCycle(dependencies.reader.readCycle());
  if (cycle === null) return SUCCEEDED;

  if (cycle.trainEnabled) {
    for (let index = 0; index < cycle.foreignCount; index++) {
      const decision = planSpyTraining(dependencies.reader.readTraining(index));
      if (decision === null) continue;
      const outcome = dependencies.executor.execute(decision);
      if (outcome.status !== "succeeded") return outcome;
    }
  }
  if (!cycle.espionageEnabled) return SUCCEEDED;

  for (let index = 0; index < cycle.foreignCount; index++) {
    const decision = planSpyEspionage(dependencies.reader.readEspionage(index));
    if (decision === null) continue;
    const outcome = dependencies.executor.execute(decision);
    if (outcome.status !== "succeeded") return outcome;
  }
  return SUCCEEDED;
}
