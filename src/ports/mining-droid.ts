import type {
  MiningDroidCurrent,
  MiningDroidPlanningInput,
} from "../domain/mining-droid.ts";

export interface MiningDroidReader {
  readPlanningInput(): MiningDroidPlanningInput;
  readCurrent(productionIds: readonly string[]): readonly MiningDroidCurrent[];
}
