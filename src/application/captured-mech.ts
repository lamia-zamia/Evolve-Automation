import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planCapturedMechAuto,
  planCapturedMechBuild,
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
 * Full Mech pass: the user-blueprint path first, then one automatic design
 * build. Each path invokes at most one game action with its own verified
 * postcondition; the pass never retries a design the game did not commit.
 */
export function runCapturedMechAutomation(
  dependencies: CapturedMechAutomation,
): CommandExecutionOutcome {
  const built = runCapturedMech(dependencies);
  if (built.status !== "succeeded") return built;
  const state = dependencies.reader.readState();
  if (!state.available || state.settings.buildMode !== "random") {
    return CAPTURED_MECH_SUCCEEDED;
  }
  const plan = planCapturedMechAuto(state, (choices) =>
    Math.floor(dependencies.random.nextUnit() * choices),
  );
  return plan === null
    ? CAPTURED_MECH_SUCCEEDED
    : dependencies.executor.executeAutoBuild(plan);
}
