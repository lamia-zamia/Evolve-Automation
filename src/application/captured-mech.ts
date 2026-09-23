import type { CommandExecutionOutcome } from "../domain/commands.ts";
import {
  planCapturedMechAuto,
  planCapturedMechBuild,
  planCapturedMechScrap,
} from "../domain/combat/captured-mech.ts";
import type { CapturedMechBuildInput } from "../domain/combat/captured-mech.ts";
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

interface CapturedMechBuildPassResult extends CapturedMechAutomationResult {
  readonly input: Readonly<CapturedMechBuildInput>;
}

function runCapturedMechBuildWithActivity(dependencies: {
  readonly reader: CapturedMechReader;
  readonly executor: CapturedMechExecutor;
}): CapturedMechBuildPassResult {
  const input = dependencies.reader.read();
  const decision = planCapturedMechBuild(input);
  return Object.freeze({
    input,
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

function capturedMechAutomationResult(
  result: Readonly<CapturedMechAutomationResult>,
): CapturedMechAutomationResult {
  return Object.freeze({
    outcome: result.outcome,
    hasPendingWork: result.hasPendingWork,
  });
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
  if (built.status !== "succeeded") {
    return capturedMechAutomationResult(userBuildResult);
  }
  const state = dependencies.reader.readState();
  if (!state.available || state.inventory.length > state.bay.active) {
    return capturedMechAutomationResult(userBuildResult);
  }
  // A successful direct blueprint build is the one action for this tick.
  if (userBuildResult.hasPendingWork) {
    return capturedMechAutomationResult(userBuildResult);
  }
  const pick = (choices: number): number =>
    Math.floor(dependencies.random.nextUnit() * choices);
  const userBuildCost =
    state.settings.buildMode === "user" &&
    userBuildResult.input.available &&
    userBuildResult.input.buildMode === "user" &&
    !userBuildResult.input.infernal &&
    state.blueprint !== null &&
    state.blueprint.size === userBuildResult.input.designSize
      ? Object.freeze({
          supply: userBuildResult.input.designSupply,
          gems: userBuildResult.input.designSoul,
          space: userBuildResult.input.designSpace,
        })
      : undefined;
  const scrap = planCapturedMechScrap(
    state,
    pick,
    dependencies.reader.readCanExpandBay(),
    userBuildCost,
  );
  if (scrap !== null) {
    return Object.freeze({
      outcome: dependencies.executor.executeAutoScrap(scrap),
      hasPendingWork: true,
    });
  }
  if (state.settings.buildMode !== "random") {
    return capturedMechAutomationResult(userBuildResult);
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
