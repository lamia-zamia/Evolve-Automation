import type { CommandExecutionOutcome } from "../domain/commands.ts";
import type {
  CapturedSpyTrainingInput,
  CapturedSpyTrainingDecision,
} from "../domain/combat/captured-spy-training.ts";

export interface CapturedSpyTrainingCycle {
  readonly available: boolean;
  readonly governmentCount: number;
}

export interface CapturedSpyTrainingReader {
  readCycle(): CapturedSpyTrainingCycle;
  readGovernment(index: number): CapturedSpyTrainingInput;
}

export interface CapturedSpyTrainingExecutor {
  execute(
    decision: Readonly<CapturedSpyTrainingDecision>,
  ): CommandExecutionOutcome;
}
