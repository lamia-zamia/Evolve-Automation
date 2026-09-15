import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { planCapturedSpyTraining } from "../domain/combat/captured-spy-training.ts";
import type {
  CapturedSpyTrainingExecutor,
  CapturedSpyTrainingReader,
} from "../ports/captured-spy-training.ts";

const CAPTURED_SPY_TRAINING_SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runCapturedSpyTraining(dependencies: {
  readonly reader: CapturedSpyTrainingReader;
  readonly executor: CapturedSpyTrainingExecutor;
}): CommandExecutionOutcome {
  const cycle = dependencies.reader.readCycle();
  if (!cycle.available) return CAPTURED_SPY_TRAINING_SUCCEEDED;
  for (let index = 0; index < cycle.governmentCount; index += 1) {
    const decision = planCapturedSpyTraining(
      dependencies.reader.readGovernment(index),
    );
    if (decision !== null) {
      const outcome = dependencies.executor.execute(decision);
      if (outcome.status !== "succeeded") return outcome;
    }
  }
  return CAPTURED_SPY_TRAINING_SUCCEEDED;
}
