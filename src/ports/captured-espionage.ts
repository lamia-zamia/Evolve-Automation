import type {
  CapturedEspionageDecision,
  CapturedEspionageInput,
} from "../domain/combat/captured-espionage.ts";
import type { DecisionExecutor } from "./decision-executor.ts";

export interface CapturedEspionageReader {
  read(): CapturedEspionageInput;
}

export type CapturedEspionageExecutor =
  DecisionExecutor<CapturedEspionageDecision>;
