import type {
  CraftCandidateInput,
  CraftDecision,
  CraftGateInput,
} from "../domain/economy/production/craft.ts";
import type { CommandExecutionOutcome } from "../domain/commands.ts";

/** Describes whether a craft executor may safely let the application consider another candidate. */
export type CraftExecutionDisposition =
  | "verified-success"
  | "candidate-rejected"
  | "invoked-but-unverified"
  | "stopped";

export interface CraftExecutionResult {
  readonly outcome: CommandExecutionOutcome;
  readonly disposition: CraftExecutionDisposition;
}

export interface CraftExecutor {
  execute(decision: Readonly<CraftDecision>): CraftExecutionResult;
}

export interface CraftReader {
  readGate(): CraftGateInput;
  readCandidate(index: number): CraftCandidateInput | null;
}
