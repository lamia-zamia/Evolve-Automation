/**
 * Composes the captured city-build slice: page capture in, one build cycle out.
 *
 * This is the whole vertical — validated input from the captured root, the existing pure planners,
 * one captured game command — with no dependency on the compatibility runtime. It is not on the
 * production tick yet; the compatibility runtime still owns autoBuild until the replacement covers
 * enough behaviour to cut over.
 */

import { runBuildAutomation } from "../application/build.ts";
import type { CommandExecutionOutcome } from "../domain/commands.ts";
import { createCapturedActionCostReader } from "../adapters/evolve/captured-action-costs.ts";
import {
  createCapturedBuildAdapter,
  type CapturedBuildPolicy,
} from "../adapters/evolve/progression/build/captured-build.ts";
import type { GameControlRegistry } from "../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../ports/game-root-state.ts";
import type { TickDiagnostics } from "../ports/tick.ts";

export interface CapturedBuildControlDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readPolicy: () => CapturedBuildPolicy;
  readonly diagnostics?: TickDiagnostics | undefined;
  /** Reports a candidate or price the capture could not supply. */
  readonly onSkipped?: (key: string, reason: string) => void;
}

export interface CapturedBuildControl {
  /** Runs one build cycle. Safe to call before the game has created its state. */
  runCycle(): CommandExecutionOutcome;
}

const NOT_CAPTURED: CommandExecutionOutcome = Object.freeze({
  status: "rejected",
  failure: Object.freeze({
    code: "game-state-not-captured",
    message: "the game root has not been captured yet",
  }),
});

export function createCapturedBuildControl(
  dependencies: CapturedBuildControlDependencies,
): CapturedBuildControl {
  const { rootState, controls, readPolicy, diagnostics } = dependencies;
  const onSkipped = dependencies.onSkipped;
  const costs = createCapturedActionCostReader({
    rootState,
    controls,
    ...(onSkipped === undefined ? {} : { onUnavailable: onSkipped }),
  });
  const { reader, executor } = createCapturedBuildAdapter({
    rootState,
    controls,
    costs,
    readPolicy,
    ...(onSkipped === undefined ? {} : { onSkipped }),
  });

  return Object.freeze({
    runCycle(): CommandExecutionOutcome {
      if (rootState.readRoot() === undefined) return NOT_CAPTURED;
      return runBuildAutomation({ reader, executor, diagnostics });
    },
  });
}
