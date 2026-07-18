import type {
  ReplicatorGovernorGateInput,
  ReplicatorGovernorSettingsInput,
  ReplicatorMetric,
  ReplicatorPlanningInput,
  ReplicatorPriorityPlan,
} from "../domain/replicator.ts";

export interface ReplicatorSelectionReader {
  readPlanningInput(): ReplicatorPlanningInput;
  readMetrics(
    priorityPlan: Readonly<ReplicatorPriorityPlan>,
  ): readonly ReplicatorMetric[];
}

export interface ReplicatorGovernorGameReader {
  readGate(): ReplicatorGovernorGateInput;
  readTasks(): readonly string[];
}

export interface ReplicatorGovernorOfficeReader {
  open(): boolean;
  readSettings(): ReplicatorGovernorSettingsInput | null;
}
