import { planPrestige } from "../domain/prestige.ts";
import type { PrestigeExecutor, PrestigeReader } from "../ports/prestige.ts";

export interface PrestigeCycleDependencies {
  readonly reader: PrestigeReader;
  readonly executor: PrestigeExecutor;
}

/**
 * Runs one autoPrestige cycle: sample the selected branch, plan the commands,
 * and execute them in order. The planner owns the one-tick reset delay, so the
 * runner stays a straight sample -> plan -> apply composition.
 */
export function runPrestige({
  reader,
  executor,
}: PrestigeCycleDependencies): void {
  for (const command of planPrestige(reader.samplePrestige())) {
    executor.execute(command);
  }
}
