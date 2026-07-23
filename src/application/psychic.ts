import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { planPsychic, type PsychicDecision } from "../domain/traits/psychic.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type { PsychicReader } from "../ports/psychic.ts";

export interface PsychicAutomationDependencies {
  readonly reader: PsychicReader;
  readonly executor: DecisionExecutor<PsychicDecision>;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runPsychicAutomation(
  dependencies: PsychicAutomationDependencies,
): CommandExecutionOutcome {
  if (!dependencies.reader.readGate().unlocked) return SUCCEEDED;
  for (const decision of planPsychic(dependencies.reader.readPlan())) {
    const outcome = dependencies.executor.execute(decision);
    if (outcome.status === "succeeded") return outcome;
    if (outcome.failure.code !== "psychic-control-unavailable") return outcome;
  }
  return SUCCEEDED;
}
