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

export interface CapturedMechAutomationResult {
  readonly outcome: CommandExecutionOutcome;
  /** A build or scrap plan was issued during this pass. */
  readonly hasPendingWork: boolean;
}

function runCapturedMechBuildWithActivity(dependencies: {
  readonly reader: CapturedMechReader;
  readonly executor: CapturedMechExecutor;
}): CapturedMechAutomationResult {
  const decision = planCapturedMechBuild(dependencies.reader.read());
  return Object.freeze({
    outcome:
      decision === null
        ? CAPTURED_MECH_SUCCEEDED
        : dependencies.executor.execute(decision),
    hasPendingWork: decision !== null,
  });
}

export function runCapturedMech(dependencies: {
  readonly reader: CapturedMechReader;
  readonly executor: CapturedMechExecutor;
}): CommandExecutionOutcome {
  return runCapturedMechBuildWithActivity(dependencies).outcome;
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
  return runCapturedMechAutomationWithActivity(dependencies).outcome;
}

export function runCapturedMechAutomationWithActivity(
  dependencies: CapturedMechAutomation,
): CapturedMechAutomationResult {
  const initialState = dependencies.reader.readState();
  if (
    !initialState.available ||
    initialState.inventory.length > initialState.bay.active
  ) {
    return Object.freeze({
      outcome: CAPTURED_MECH_SUCCEEDED,
      hasPendingWork: false,
    });
  }
  const userBuildResult = runCapturedMechBuildWithActivity(dependencies);
  const built = userBuildResult.outcome;
  if (built.status !== "succeeded") return userBuildResult;
  const state = dependencies.reader.readState();
  if (
    !state.available ||
    state.inventory.length > state.bay.active ||
    state.settings.buildMode !== "random"
  ) {
    return Object.freeze({
      outcome: CAPTURED_MECH_SUCCEEDED,
      hasPendingWork: userBuildResult.hasPendingWork,
    });
  }
  const pick = (choices: number): number =>
    Math.floor(dependencies.random.nextUnit() * choices);
  const scrap = planCapturedMechScrap(
    state,
    pick,
    dependencies.reader.readCanExpandBay(),
  );
  if (scrap !== null) {
    return Object.freeze({
      outcome: dependencies.executor.executeAutoScrap(scrap),
      hasPendingWork: true,
    });
  }
  const plan = planCapturedMechAuto(state, pick);
  return plan === null
    ? Object.freeze({
        outcome: CAPTURED_MECH_SUCCEEDED,
        hasPendingWork: userBuildResult.hasPendingWork,
      })
    : Object.freeze({
        outcome: dependencies.executor.executeAutoBuild(plan),
        hasPendingWork: true,
      });
}
