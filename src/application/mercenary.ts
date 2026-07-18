import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planMercenaryCycle,
  planMercenaryHire,
  planMercenaryLog,
} from "../domain/mercenary.ts";
import type {
  MercenaryExecutor,
  MercenaryLogger,
  MercenaryReader,
} from "../ports/mercenary.ts";

export interface MercenaryAutomationDependencies {
  readonly reader: MercenaryReader;
  readonly executor: MercenaryExecutor;
  readonly logger: MercenaryLogger;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runMercenaryAutomation(
  dependencies: MercenaryAutomationDependencies,
): CommandExecutionOutcome {
  const cycle = planMercenaryCycle(dependencies.reader.readCycle());
  if (cycle === null) return SUCCEEDED;

  let hired = 0;
  let outcome: CommandExecutionOutcome = SUCCEEDED;
  while (true) {
    const decision = planMercenaryHire(cycle, dependencies.reader.readState());
    if (decision === null) break;
    const result = dependencies.executor.hire(decision);
    if (result.status === "hired") {
      hired++;
      continue;
    }
    if (result.status !== "not-hired") outcome = result;
    break;
  }

  const event = planMercenaryLog(hired);
  if (event !== null) dependencies.logger.write(event);
  return outcome;
}
