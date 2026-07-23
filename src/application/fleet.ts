import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { planFleet } from "../domain/combat/fleet.ts";
import type { FleetExecutor, FleetReader } from "../ports/fleet.ts";

export interface FleetAutomationDependencies {
  readonly reader: FleetReader;
  readonly executor: FleetExecutor;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runFleetAutomation(
  dependencies: FleetAutomationDependencies,
): CommandExecutionOutcome {
  const decision = planFleet(dependencies.reader.read());
  return decision === null
    ? SUCCEEDED
    : dependencies.executor.execute(decision);
}
