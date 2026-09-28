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

export function createCapturedEspionageRunner(dependencies: {
  readonly reader: CapturedEspionageReader;
  readonly executor: CapturedEspionageExecutor;
  readonly isGovernorEspionageOwned: () => boolean;
  readonly standDown: () => void;
}): () => CommandExecutionOutcome {
  let nextGovernmentId = 0;

  return () => {
    if (dependencies.isGovernorEspionageOwned()) {
      dependencies.standDown();
      return CAPTURED_ESPIONAGE_SUCCEEDED;
    }
    const inputs = dependencies.reader.readAll();
    if (inputs.length === 0) return CAPTURED_ESPIONAGE_SUCCEEDED;
    const firstIndex = inputs.findIndex(
      (input) => input.governmentId >= nextGovernmentId,
    );
    const startIndex = firstIndex < 0 ? 0 : firstIndex;
    for (let offset = 0; offset < inputs.length; offset += 1) {
      const input = inputs[(startIndex + offset) % inputs.length]!;
      const decision = planCapturedEspionage(input);
      if (decision === null) continue;
      if (dependencies.isGovernorEspionageOwned()) {
        dependencies.standDown();
        return CAPTURED_ESPIONAGE_SUCCEEDED;
      }
      const outcome = dependencies.executor.execute(decision);
      if (
        outcome.status === "succeeded" ||
        (outcome.status === "stale" &&
          outcome.failure.code === "captured-espionage-postcondition-pending")
      ) {
        nextGovernmentId = decision.governmentId + 1;
      }
      return outcome;
    }
    return CAPTURED_ESPIONAGE_SUCCEEDED;
  };
}
