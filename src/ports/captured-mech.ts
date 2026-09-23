import type { CommandExecutionOutcome } from "../domain/commands.ts";
import type {
  CapturedMechAutoPlan,
  CapturedMechBuildDecision,
  CapturedMechBuildInput,
  CapturedMechScrapPlan,
} from "../domain/combat/captured-mech.ts";
import type {
  CapturedMechReservedResources,
  CapturedMechState,
} from "../domain/combat/mech-state.ts";
import type { MechDemandCostPlan } from "../domain/combat/mech-auto-choice.ts";
import type { RandomSource } from "./randomness.ts";

export interface CapturedMechReader {
  read(): CapturedMechBuildInput;
  /** The shared normalized Mech model for planner, settings UI, and executors. */
  readState(): CapturedMechState;
  /** Captured construction and game facts for the legacy bay-expansion scrap guard. */
  readCanExpandBay(): boolean | undefined;
}

/** One captured read shared by global resource demand and construction reservations. */
export interface CapturedMechDemandSource {
  read(reserved?: Readonly<CapturedMechReservedResources>): Readonly<{
    readonly buildingMechsFirst: boolean;
    /** Next target for global resource demand. */
    readonly plan: MechDemandCostPlan;
    /** Mech-first target: ready when viable now, unavailable when a possible cost cannot be read. */
    readonly immediatePlan: MechDemandCostPlan;
  }>;
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
