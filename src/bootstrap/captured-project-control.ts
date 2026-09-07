/**
 * Composes one captured A.R.P.A. cycle. It remains off the production tick while the compatibility
 * runtime still owns the combined building/project ordering.
 */

import { createCapturedCostConflictReader } from "../adapters/evolve/captured-cost-conflict.ts";
import { createCapturedQueueReservationSource } from "../adapters/evolve/captured-queue-reservations.ts";
import { createCapturedActionCostReader } from "../adapters/evolve/captured-action-costs.ts";
import { createCapturedTabDiscovery } from "../adapters/evolve/captured-tab-discovery.ts";
import { createCapturedResourceSource } from "../adapters/evolve/captured-world-state.ts";
import { createCapturedProjectAdapter } from "../adapters/evolve/progression/research/captured-project.ts";
import { createCapturedProjectCatalog } from "../adapters/evolve/progression/research/captured-project-catalog.ts";
import { runBuildAutomation } from "../application/build.ts";
import type { CommandExecutionOutcome } from "../domain/commands.ts";
import type { GameControlRegistry } from "../ports/game-control-registry.ts";
import type { GameDrawnProjectsReader } from "../ports/game-drawn-projects.ts";
import type { GameMountSuppression } from "../ports/game-mount-suppression.ts";
import type { GamePanelWorkspace } from "../ports/game-panel-workspace.ts";
import type { GameRootStateSource } from "../ports/game-root-state.ts";
import type { TickDiagnostics } from "../ports/tick.ts";

export interface CapturedProjectControlDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly mountSuppression: GameMountSuppression;
  readonly panels: GamePanelWorkspace;
  readonly drawnProjects: GameDrawnProjectsReader;
  readonly readSettings: () => unknown;
  readonly diagnostics?: TickDiagnostics | undefined;
  readonly onUnavailable?: (reason: string) => void;
}

export interface CapturedProjectControl {
  runCycle(): CommandExecutionOutcome;
}

const NOT_CAPTURED: CommandExecutionOutcome = Object.freeze({
  status: "rejected",
  failure: Object.freeze({
    code: "game-state-not-captured",
    message: "the game root has not been captured yet",
  }),
});

export function createCapturedProjectControl(
  dependencies: CapturedProjectControlDependencies,
): CapturedProjectControl {
  const {
    rootState,
    controls,
    mountSuppression,
    panels,
    drawnProjects,
    readSettings,
    diagnostics,
  } = dependencies;
  const onUnavailable = dependencies.onUnavailable;
  const resources = createCapturedResourceSource(rootState);
  const discovery = createCapturedTabDiscovery({
    rootState,
    controls,
    mountSuppression,
    panels,
  });
  const catalog = createCapturedProjectCatalog({
    rootState,
    discovery,
    drawnProjects,
    controls,
    ...(onUnavailable === undefined ? {} : { onUnavailable }),
  });
  const reservations = createCapturedQueueReservationSource({
    rootState,
    resources,
    costs: createCapturedActionCostReader({
      rootState,
      controls,
      ...(onUnavailable === undefined
        ? {}
        : { onUnavailable: (id, reason) => onUnavailable(`${id}: ${reason}`) }),
    }),
    ...(onUnavailable === undefined
      ? {}
      : { onUnavailable: (id, reason) => onUnavailable(`${id}: ${reason}`) }),
  });
  const conflicts = createCapturedCostConflictReader({
    resources,
    reservations,
  });

  return Object.freeze({
    runCycle(): CommandExecutionOutcome {
      if (rootState.readRoot() === undefined) return NOT_CAPTURED;
      const { reader, executor } = createCapturedProjectAdapter({
        rootState,
        offered: catalog.readProjects(),
        resources,
        conflicts,
        controls,
        readSettings,
      });
      return runBuildAutomation({ reader, executor, diagnostics });
    },
  });
}
