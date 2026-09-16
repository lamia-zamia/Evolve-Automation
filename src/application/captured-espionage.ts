import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { planCapturedEspionage } from "../domain/combat/captured-espionage.ts";
import type {
  CapturedEspionageExecutor,
  CapturedEspionageReader,
} from "../ports/captured-espionage.ts";

const CAPTURED_ESPIONAGE_SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runCapturedEspionage(dependencies: {
  readonly reader: CapturedEspionageReader;
  readonly executor: CapturedEspionageExecutor;
  readonly isGovernorEspionageOwned: () => boolean;
  readonly standDown: () => void;
}): CommandExecutionOutcome {
  if (dependencies.isGovernorEspionageOwned()) {
    dependencies.standDown();
    return CAPTURED_ESPIONAGE_SUCCEEDED;
  }
  const decision = planCapturedEspionage(dependencies.reader.read());
  if (decision === null) return CAPTURED_ESPIONAGE_SUCCEEDED;
  if (dependencies.isGovernorEspionageOwned()) {
    dependencies.standDown();
    return CAPTURED_ESPIONAGE_SUCCEEDED;
  }
  return dependencies.executor.execute(decision);
}
