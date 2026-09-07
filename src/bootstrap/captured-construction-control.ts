/**
 * Composes one captured construction cycle: city buildings and A.R.P.A. projects in a single
 * weighting order, sharing one set of holdings and one set of queue reservations.
 *
 * This is the whole vertical — validated input from the captured root, the existing pure planners,
 * captured game commands — with no dependency on the compatibility runtime. It is not on the
 * production tick yet; the compatibility runtime still owns autoBuild until the replacement covers
 * enough behaviour to cut over.
 */

import { createCapturedActionCostReader } from "../adapters/evolve/captured-action-costs.ts";
import { createCapturedCostConflictReader } from "../adapters/evolve/captured-cost-conflict.ts";
import { createCapturedQueueReservationSource } from "../adapters/evolve/captured-queue-reservations.ts";
import { createCapturedTabDiscovery } from "../adapters/evolve/captured-tab-discovery.ts";
import {
  createCapturedRaceTraitSource,
  createCapturedResourceSource,
  createCapturedTechSource,
} from "../adapters/evolve/captured-world-state.ts";
import { createCapturedBuildSource } from "../adapters/evolve/progression/build/captured-build.ts";
import type { CapturedBuildTarget } from "../adapters/evolve/progression/build/captured-build.ts";
import { createCapturedConstructionAdapter } from "../adapters/evolve/progression/construction/captured-construction.ts";
import { createCapturedProjectCatalog } from "../adapters/evolve/progression/research/captured-project-catalog.ts";
import { createCapturedProjectContextReader } from "../adapters/evolve/progression/research/captured-project-context.ts";
import { createCapturedProjectSource } from "../adapters/evolve/progression/research/captured-project.ts";
import { runBuildAutomation } from "../application/build.ts";
import type { CommandExecutionOutcome } from "../domain/commands.ts";
import type { ConstructionCycleOptions } from "../ports/construction-candidates.ts";
import type { GameControlRegistry } from "../ports/game-control-registry.ts";
import type { GameDrawnProjectsReader } from "../ports/game-drawn-projects.ts";
import type { GameMountSuppression } from "../ports/game-mount-suppression.ts";
import type { GamePanelWorkspace } from "../ports/game-panel-workspace.ts";
import type { GameRootStateSource } from "../ports/game-root-state.ts";
import type { OfferedTech } from "../ports/game-tech-catalog.ts";
import type { TickDiagnostics } from "../ports/tick.ts";

/** Everything the caller configures for one cycle, across both families. */
export interface CapturedConstructionPolicy extends ConstructionCycleOptions {
  readonly buildings: readonly Readonly<CapturedBuildTarget>[];
}

export interface CapturedConstructionControlDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly mountSuppression: GameMountSuppression;
  readonly panels: GamePanelWorkspace;
  readonly drawnProjects: GameDrawnProjectsReader;
  readonly readPolicy: () => CapturedConstructionPolicy;
  /** Persisted A.R.P.A. settings, normalized at the adapter boundary. */
  readonly readSettings: () => unknown;
  /**
   * The technologies the game is offering, which is the only captured route to a technology's
   * price. Supply it to make the player's research queue reserve what it is saving for; without it
   * this cycle cannot see that commitment and does not model it. It is asked for only when that
   * queue actually has an entry waiting, so an unused research queue costs nothing.
   */
  readonly readOfferedTechs?: () =>
    readonly Readonly<OfferedTech>[] | undefined;
  readonly diagnostics?: TickDiagnostics | undefined;
  /** Reports a candidate, price, or catalog the capture could not supply. */
  readonly onSkipped?: (key: string, reason: string) => void;
}

export interface CapturedConstructionControl {
  /** Runs one construction cycle. Safe to call before the game has created its state. */
  runCycle(): CommandExecutionOutcome;
}

const NOT_CAPTURED: CommandExecutionOutcome = Object.freeze({
  status: "rejected",
  failure: Object.freeze({
    code: "game-state-not-captured",
    message: "the game root has not been captured yet",
  }),
});

export function createCapturedConstructionControl(
  dependencies: CapturedConstructionControlDependencies,
): CapturedConstructionControl {
  const {
    rootState,
    controls,
    mountSuppression,
    panels,
    drawnProjects,
    readPolicy,
    readSettings,
    diagnostics,
  } = dependencies;
  const onSkipped = dependencies.onSkipped;
  const readOfferedTechs = dependencies.readOfferedTechs;
  // The offered-technology catalog is asked for at most once per cycle, and only if something in
  // the cycle actually needs it. Every candidate consults the same reservations, so without this
  // the cycle would pay for one discovery pass per candidate.
  let offeredThisCycle:
    | { readonly value: readonly Readonly<OfferedTech>[] | undefined }
    | undefined;
  const readOfferedTechsOnce = ():
    readonly Readonly<OfferedTech>[] | undefined => {
    offeredThisCycle ??= { value: readOfferedTechs?.() };
    return offeredThisCycle.value;
  };
  const resources = createCapturedResourceSource(rootState);
  const costs = createCapturedActionCostReader({
    rootState,
    controls,
    ...(onSkipped === undefined ? {} : { onUnavailable: onSkipped }),
  });
  const reservations = createCapturedQueueReservationSource({
    rootState,
    resources,
    costs,
    ...(readOfferedTechs === undefined
      ? {}
      : { readOfferedTechs: readOfferedTechsOnce }),
    ...(onSkipped === undefined ? {} : { onUnavailable: onSkipped }),
  });
  const conflicts = createCapturedCostConflictReader({
    resources,
    reservations,
  });
  const catalog = createCapturedProjectCatalog({
    rootState,
    discovery: createCapturedTabDiscovery({
      rootState,
      controls,
      mountSuppression,
      panels,
    }),
    drawnProjects,
    controls,
    ...(onSkipped === undefined
      ? {}
      : { onUnavailable: (reason: string) => onSkipped("arpa", reason) }),
  });
  const { reader, executor } = createCapturedConstructionAdapter({
    // City buildings first, matching the game's own list order, so a project only outranks a
    // building by weighting rather than by being sampled first.
    sources: Object.freeze([
      createCapturedBuildSource({
        rootState,
        controls,
        costs,
        readTargets: () => readPolicy().buildings,
        ...(onSkipped === undefined ? {} : { onSkipped }),
      }),
      createCapturedProjectSource({
        rootState,
        catalog,
        resources,
        controls,
        context: createCapturedProjectContextReader({
          traits: createCapturedRaceTraitSource(rootState),
          tech: createCapturedTechSource(rootState),
          resources,
          readSettings,
        }),
        readSettings,
      }),
    ]),
    resources,
    conflicts,
    readOptions: readPolicy,
  });

  return Object.freeze({
    runCycle(): CommandExecutionOutcome {
      if (rootState.readRoot() === undefined) return NOT_CAPTURED;
      offeredThisCycle = undefined;
      try {
        return runBuildAutomation({ reader, executor, diagnostics });
      } finally {
        offeredThisCycle = undefined;
      }
    },
  });
}
