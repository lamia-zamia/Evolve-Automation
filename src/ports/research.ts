import type { CommandExecutionOutcome } from "../domain/commands.ts";
import type {
  ResearchDecision,
  ResearchInput,
} from "../domain/progression/research/research.ts";

/** Reads one ordered research phase, beginning at the supplied list index. */
export interface ResearchReader {
  read(startIndex: number): ResearchInput;
  /** Exact current `tech-mad` offer check using this cycle's prepared native snapshot. */
  readMadGoalCandidate?(): ResearchInput["madGoalCandidate"];
}

/** Describes what the executor learned about the selected technology. */
export type ResearchExecutionDisposition =
  | "researched"
  /** A fresh pre-invocation check proved this exact candidate requires no action. */
  | "candidate-rejected"
  /** The command was invoked, but no research mutation was observed. */
  | "no-observed-research"
  /** Execution did not establish that it is safe to consider another technology. */
  | "stopped";

export interface ResearchExecutionResult {
  readonly outcome: CommandExecutionOutcome;
  readonly disposition: ResearchExecutionDisposition;
}

export interface ResearchCommandExecutor {
  execute(decision: Readonly<ResearchDecision>): ResearchExecutionResult;
}
