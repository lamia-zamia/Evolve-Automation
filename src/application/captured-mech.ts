import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planCapturedMechAuto,
  planCapturedMechBuild,
  planCapturedMechScrap,
} from "../domain/combat/captured-mech.ts";
import type {
  CapturedMechAutomation,
  CapturedMechExecutor,
  CapturedMechReader,
} from "../ports/captured-mech.ts";

const CAPTURED_MECH_SUCCEEDED: CommandExecutionOutcome = Object.freeze({
  status: "succeeded",
});

export function runCapturedMech(dependencies: {
  readonly reader: CapturedMechReader;
  readonly executor: CapturedMechExecutor;
}): CommandExecutionOutcome {
  const decision = planCapturedMechBuild(dependencies.reader.read());
  return decision === null
    ? CAPTURED_MECH_SUCCEEDED
    : dependencies.executor.execute(decision);
}

/**
 * Full Mech pass: the user-blueprint path first, then at most one automatic
 * action. A warranted scrap always goes first and ends the pass — the
 * replacement is a fresh plan on the next tick, only after the disappearance
 * postcondition. Each path invokes at most one game action with its own
 * verified postcondition; the pass never retries what the game did not commit.
 */
export function runCapturedMechAutomation(
  dependencies: CapturedMechAutomation,
): CommandExecutionOutcome {
  const initialState = dependencies.reader.readState();
  if (
    !initialState.available ||
    initialState.inventory.length > initialState.bay.active
  ) {
    return CAPTURED_MECH_SUCCEEDED;
  }
  const built = runCapturedMech(dependencies);
  if (built.status !== "succeeded") return built;
  const state = dependencies.reader.readState();
  if (
    !state.available ||
    state.inventory.length > state.bay.active ||
    state.settings.buildMode !== "random"
  ) {
    return CAPTURED_MECH_SUCCEEDED;
  }
  const pick = (choices: number): number =>
    Math.floor(dependencies.random.nextUnit() * choices);
  const scrap = planCapturedMechScrap(
    state,
    pick,
    dependencies.reader.readCanExpandBay(),
  );
  if (scrap !== null) return dependencies.executor.executeAutoScrap(scrap);
  const plan = planCapturedMechAuto(state, pick);
  return plan === null
    ? CAPTURED_MECH_SUCCEEDED
    : dependencies.executor.executeAutoBuild(plan);
}
