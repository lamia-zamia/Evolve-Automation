/** Captured Truepath outer-fleet composition. */

import type { GameActivitySink } from "../ports/game-message-log.ts";
import type { GameControlRegistry } from "../ports/game-control-registry.ts";
import type { CapturedOuterFleetDispatchCapture } from "../ports/captured-outer-fleet-dispatch.ts";
import type { GameRootStateSource } from "../ports/game-root-state.ts";
import type { GameShipyardCosts } from "../ports/game-shipyard-costs.ts";
import type { GameShipyardPartCatalogSource } from "../ports/game-shipyard-parts.ts";
import { createCapturedFleetControls } from "../adapters/evolve/combat/captured-fleet-controls.ts";
import { createCapturedOuterFleetAdapter } from "../adapters/evolve/combat/captured-fleet-outer.ts";
import { runOuterFleetAutomation } from "../application/fleet-outer.ts";
import type { OuterFleetAutomationResult } from "../application/fleet-outer.ts";

interface CapturedFleetOuterDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  /** The yard's own cost row: the price of a candidate and the identity of the current design. */
  readonly costs: GameShipyardCosts;
  /** The yard's own option markup: which parts it offers and which position each one owns. */
  readonly parts: GameShipyardPartCatalogSource;
  /** The game's own dispatch closure, reached without a dispatch window. */
  readonly dispatch: CapturedOuterFleetDispatchCapture;
  readonly readSettings: () => unknown;
  readonly onActivity?: GameActivitySink;
}

export function createCapturedOuterFleetControl(
  dependencies: CapturedFleetOuterDependencies,
): {
  readonly autoFleetOuter: () => OuterFleetAutomationResult;
} {
  const adapter = createCapturedOuterFleetAdapter({
    rootState: dependencies.rootState,
    controls: createCapturedFleetControls({
      controls: dependencies.controls,
      parts: dependencies.parts,
    }),
    costs: dependencies.costs,
    parts: dependencies.parts,
    dispatch: dependencies.dispatch,
    readSettings: dependencies.readSettings,
    ...(dependencies.onActivity === undefined
      ? {}
      : { onActivity: dependencies.onActivity }),
  });
  return Object.freeze({
    autoFleetOuter: () => runOuterFleetAutomation(adapter),
  });
}
