import type { CommandExecutionOutcome } from "../domain/commands.ts";
import type {
  TriggerClickDecision,
  TriggerInput,
} from "../domain/progression/build/trigger.ts";

/** Reads one trigger phase from the ordered target list. */
export interface TriggerReader {
  read(index: number): TriggerInput;
}

export interface TriggerExecutionResult {
  readonly outcome: CommandExecutionOutcome;
  readonly clicked: boolean;
}

export interface TriggerCommandExecutor {
  execute(decision: Readonly<TriggerClickDecision>): TriggerExecutionResult;
}
