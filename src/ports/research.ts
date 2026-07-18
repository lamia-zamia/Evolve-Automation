import type { CommandExecutionOutcome } from "../domain/commands.ts";
import type { ResearchDecision, ResearchInput } from "../domain/research.ts";

/** Reads one ordered research phase, beginning at the supplied list index. */
export interface ResearchReader {
  read(startIndex: number): ResearchInput;
}

export interface ResearchExecutionResult {
  readonly outcome: CommandExecutionOutcome;
  /** False means the safe click declined and the next phase may be sampled. */
  readonly researched: boolean;
}

export interface ResearchCommandExecutor {
  execute(decision: Readonly<ResearchDecision>): ResearchExecutionResult;
}
