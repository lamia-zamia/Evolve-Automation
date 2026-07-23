import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planMechBuild,
  planMechContinuation,
  planMechCycle,
  smallerMechFits,
  type MechCost,
  type MechDesign,
} from "../domain/combat/mech.ts";
import type { MechExecutor, MechReader } from "../ports/mech.ts";

export interface MechAutomationDependencies {
  readonly reader: MechReader;
  readonly executor: MechExecutor;
}

const SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runMechAutomation(
  dependencies: MechAutomationDependencies,
): CommandExecutionOutcome {
  const cycle = planMechCycle(dependencies.reader.readCycle());
  if (cycle === null) return SUCCEEDED;
  const prepared = dependencies.executor.prepare(cycle);
  if (prepared.status !== "succeeded" || !cycle.proceed) return prepared;

  const planning = dependencies.reader.readPlanning(cycle);
  if (planning === null) return SUCCEEDED;
  const continuation = planMechContinuation(planning);
  if (continuation.scrap !== null) {
    const scrapped = dependencies.executor.scrap(continuation.scrap);
    if (scrapped.status !== "succeeded") return scrapped;
  }
  if (continuation.halt) return SUCCEEDED;

  let design: Readonly<MechDesign> = planning.design;
  let cost: Readonly<MechCost> = planning.cost;
  if (continuation.trySmaller) {
    for (
      let index = planning.sizeOrder.indexOf(design.size) - 1;
      index >= 0;
      index--
    ) {
      const size = planning.sizeOrder[index];
      if (size === undefined) continue;
      cost = dependencies.reader.readSmallerCost(size);
      if (smallerMechFits(continuation, cost)) {
        design = dependencies.reader.readSmallerDesign(size);
        break;
      }
    }
  }

  const build = planMechBuild(continuation, design, cost);
  return build === null
    ? SUCCEEDED
    : dependencies.executor.build(build, continuation);
}
