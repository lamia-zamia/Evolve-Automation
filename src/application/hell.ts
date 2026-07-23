import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planHell,
  prepareHellCycle,
  type HellDecision,
  type HellTargetRequest,
} from "../domain/combat/hell.ts";
import type { HellExecutor, HellReader } from "../ports/hell.ts";

export interface HellAutomationDependencies {
  readonly reader: HellReader;
  readonly executor: HellExecutor;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runHellAutomation(
  dependencies: HellAutomationDependencies,
): CommandExecutionOutcome {
  const prepared = prepareHellCycle(dependencies.reader.readCycle());
  if (prepared === null) return SUCCEEDED;
  let decision: Readonly<HellDecision> | null;
  if (prepared.kind === "calculate-hell-targets") {
    decision = planHell(
      prepared as Readonly<HellTargetRequest>,
      dependencies.reader.readCalculation(prepared),
    );
  } else {
    decision = prepared;
  }
  return decision === null
    ? SUCCEEDED
    : dependencies.executor.execute(decision);
}
