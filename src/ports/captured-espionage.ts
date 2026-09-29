import type {
  CapturedEspionagePlan,
  CapturedEspionageInput,
} from "../domain/combat/captured-espionage.ts";
import type { DecisionExecutor } from "./decision-executor.ts";

export interface CapturedEspionageReader {
  read(): CapturedEspionageInput;
  readAll(): readonly CapturedEspionageInput[];
}

export type CapturedEspionageExecutor = DecisionExecutor<CapturedEspionagePlan>;
