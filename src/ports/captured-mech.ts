import type { CommandExecutionOutcome } from "../domain/commands.ts";
import type {
  CapturedMechBuildDecision,
  CapturedMechBuildInput,
} from "../domain/combat/captured-mech.ts";
import type { CapturedMechState } from "../domain/combat/mech-state.ts";

export interface CapturedMechReader {
  read(): CapturedMechBuildInput;
  /** The shared normalized Mech model for planner, settings UI, and executors. */
  readState(): CapturedMechState;
}

export interface CapturedMechExecutor {
  execute(
    decision: Readonly<CapturedMechBuildDecision>,
  ): CommandExecutionOutcome;
}
