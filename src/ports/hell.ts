import type {
  HellCalculationInput,
  HellDecision,
  HellCycleInput,
  HellTargetRequest,
} from "../domain/combat/hell.ts";
import type { DecisionExecutor } from "./decision-executor.ts";

export interface HellReader {
  readCycle(): HellCycleInput;
  readCalculation(request: Readonly<HellTargetRequest>): HellCalculationInput;
}

export type HellExecutor = DecisionExecutor<HellDecision>;
