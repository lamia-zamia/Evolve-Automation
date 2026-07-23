import type {
  MiningDroidCurrent,
  MiningDroidPlanningInput,
} from "../domain/economy/production/mining-droid.ts";

export interface MiningDroidReader {
  readPlanningInput(): MiningDroidPlanningInput;
  readCurrent(productionIds: readonly string[]): readonly MiningDroidCurrent[];
}
