/** Captured Truepath outer-fleet composition. */

import type { GameActivitySink } from "../ports/game-message-log.ts";
import type { GameControlRegistry } from "../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../ports/game-root-state.ts";
import { createCapturedFleetControls } from "../adapters/evolve/combat/captured-fleet-controls.ts";
import { createCapturedOuterFleetAdapter } from "../adapters/evolve/combat/captured-fleet-outer.ts";
import { runOuterFleetAutomation } from "../application/fleet-outer.ts";

interface CapturedFleetOuterDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getDocument: () => unknown;
  readonly readSettings: () => unknown;
  readonly onActivity?: GameActivitySink;
}

export function createCapturedOuterFleetControl(
  dependencies: CapturedFleetOuterDependencies,
): {
  readonly autoFleetOuter: () => ReturnType<typeof runOuterFleetAutomation>;
} {
  const adapter = createCapturedOuterFleetAdapter({
    rootState: dependencies.rootState,
    controls: createCapturedFleetControls({
      controls: dependencies.controls,
      getDocument: dependencies.getDocument,
    }),
    getDocument: dependencies.getDocument,
    readSettings: dependencies.readSettings,
    ...(dependencies.onActivity === undefined
      ? {}
      : { onActivity: dependencies.onActivity }),
  });
  return Object.freeze({
    autoFleetOuter: () => runOuterFleetAutomation(adapter),
  });
}
