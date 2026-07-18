import type { FleetDecision, FleetInput } from "../domain/fleet.ts";
import type { DecisionExecutor } from "./decision-executor.ts";

export interface FleetReader {
  read(): FleetInput;
}

export type FleetExecutor = DecisionExecutor<FleetDecision>;
