import type { CommandExecutionOutcome } from "../domain/commands.ts";

/** Narrow application-owned port for applying one already-planned decision. */
export interface DecisionExecutor<TDecision> {
  execute(decision: Readonly<TDecision>): CommandExecutionOutcome;
}
