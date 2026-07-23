import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planReplicatorGovernorSettings,
  planReplicatorGovernorTask,
  planReplicatorPriority,
  planReplicatorSelection,
  shouldConfigureReplicatorGovernor,
  type ReplicatorGovernorDecision,
  type ReplicatorSelectionDecision,
} from "../domain/economy/production/replicator.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type {
  ReplicatorGovernorGameReader,
  ReplicatorGovernorOfficeReader,
  ReplicatorSelectionReader,
} from "../ports/replicator.ts";

export interface ReplicatorAutomationDependencies {
  readonly selectionReader: ReplicatorSelectionReader;
  readonly selectionExecutor: DecisionExecutor<ReplicatorSelectionDecision>;
  readonly governorGameReader: ReplicatorGovernorGameReader;
  readonly governorOfficeReader: ReplicatorGovernorOfficeReader;
  readonly governorExecutor: DecisionExecutor<ReplicatorGovernorDecision>;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runReplicatorAutomation(
  dependencies: ReplicatorAutomationDependencies,
): CommandExecutionOutcome {
  const planningInput = dependencies.selectionReader.readPlanningInput();
  if (!planningInput.initialised) {
    return SUCCEEDED;
  }

  const priorityPlan = planReplicatorPriority(planningInput);
  if (priorityPlan !== null) {
    const selection = planReplicatorSelection(
      priorityPlan,
      dependencies.selectionReader.readMetrics(priorityPlan),
    );
    if (selection !== null) {
      const outcome = dependencies.selectionExecutor.execute(selection);
      if (outcome.status !== "succeeded") {
        return outcome;
      }
    }
  }

  if (!planningInput.assignGovernorTask) {
    return SUCCEEDED;
  }
  if (
    !shouldConfigureReplicatorGovernor(
      dependencies.governorGameReader.readGate(),
    ) ||
    !dependencies.governorOfficeReader.open()
  ) {
    return SUCCEEDED;
  }

  const taskPlan = planReplicatorGovernorTask(
    dependencies.governorGameReader.readTasks(),
  );
  if (taskPlan.status === "unavailable") {
    return SUCCEEDED;
  }
  if (taskPlan.assignment !== null) {
    const outcome = dependencies.governorExecutor.execute(taskPlan.assignment);
    if (outcome.status !== "succeeded") {
      return outcome;
    }
  }

  const settings = dependencies.governorOfficeReader.readSettings();
  if (settings === null) {
    return SUCCEEDED;
  }
  const settingsDecision = planReplicatorGovernorSettings(settings);
  return settingsDecision === null
    ? SUCCEEDED
    : dependencies.governorExecutor.execute(settingsDecision);
}
