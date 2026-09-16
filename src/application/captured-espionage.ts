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
}): CommandExecutionOutcome {
  const decision = planCapturedEspionage(dependencies.reader.read());
  return decision === null
    ? CAPTURED_ESPIONAGE_SUCCEEDED
    : dependencies.executor.execute(decision);
}
