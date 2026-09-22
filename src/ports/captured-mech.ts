import type { CommandExecutionOutcome } from "../domain/commands.ts";
import type {
  CapturedMechAutoPlan,
  CapturedMechBuildDecision,
  CapturedMechBuildInput,
  CapturedMechScrapPlan,
} from "../domain/combat/captured-mech.ts";
import type { CapturedMechState } from "../domain/combat/mech-state.ts";
import type { RandomSource } from "./randomness.ts";

export interface CapturedMechReader {
  read(): CapturedMechBuildInput;
  /** The shared normalized Mech model for planner, settings UI, and executors. */
  readState(): CapturedMechState;
}

export interface CapturedMechExecutor {
  execute(
    decision: Readonly<CapturedMechBuildDecision>,
  ): CommandExecutionOutcome;
  executeAutoBuild(
    decision: Readonly<CapturedMechAutoPlan>,
  ): CommandExecutionOutcome;
  executeAutoScrap(
    decision: Readonly<CapturedMechScrapPlan>,
  ): CommandExecutionOutcome;
}

export interface CapturedMechAutomation {
  readonly reader: CapturedMechReader;
  readonly executor: CapturedMechExecutor;
  readonly random: RandomSource;
}
