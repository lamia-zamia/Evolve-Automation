import type { CommandExecutionOutcome } from "../domain/commands.ts";
import type {
  MechBuildDecision,
  MechContinuation,
  MechCost,
  MechCycleDecision,
  MechCycleInput,
  MechDesign,
  MechPlanningInput,
  MechScrapDecision,
} from "../domain/combat/mech.ts";

export interface MechReader {
  readCycle(): MechCycleInput;
  readPlanning(decision: Readonly<MechCycleDecision>): MechPlanningInput | null;
  readSmallerCost(size: string): MechCost;
  readSmallerDesign(size: string): MechDesign;
}

export interface MechExecutor {
  prepare(decision: Readonly<MechCycleDecision>): CommandExecutionOutcome;
  scrap(decision: Readonly<MechScrapDecision>): CommandExecutionOutcome;
  build(
    decision: Readonly<MechBuildDecision>,
    continuation: Readonly<MechContinuation>,
  ): CommandExecutionOutcome;
}
