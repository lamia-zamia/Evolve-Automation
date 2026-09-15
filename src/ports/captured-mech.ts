import type { CommandExecutionOutcome } from "../domain/commands.ts";
import type {
  CapturedMechBuildDecision,
  CapturedMechBuildInput,
} from "../domain/combat/captured-mech.ts";

export interface CapturedMechReader {
  read(): CapturedMechBuildInput;
}

export interface CapturedMechExecutor {
  execute(
    decision: Readonly<CapturedMechBuildDecision>,
  ): CommandExecutionOutcome;
}
