import type {
  SpyCycleInput,
  SpyDecision,
  SpyEspionageInput,
  SpyTrainingInput,
} from "../domain/spy.ts";
import type { DecisionExecutor } from "./decision-executor.ts";

export interface SpyReader {
  readCycle(): SpyCycleInput;
  readTraining(foreignIndex: number): SpyTrainingInput;
  readEspionage(foreignIndex: number): SpyEspionageInput;
}

export type SpyExecutor = DecisionExecutor<SpyDecision>;
