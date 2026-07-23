import type { CommandExecutionOutcome } from "../domain/commands.ts";
import type {
  HireMercenaryDecision,
  MercenaryCycleInput,
  MercenaryLogEvent,
  MercenaryState,
} from "../domain/combat/mercenary.ts";

export interface MercenaryReader {
  readCycle(): MercenaryCycleInput;
  readState(): MercenaryState;
}

export type MercenaryHireResult =
  | { readonly status: "hired" }
  | { readonly status: "not-hired" }
  | CommandExecutionOutcome;

export interface MercenaryExecutor {
  hire(decision: Readonly<HireMercenaryDecision>): MercenaryHireResult;
}

export interface MercenaryLogger {
  write(event: Readonly<MercenaryLogEvent>): void;
}
