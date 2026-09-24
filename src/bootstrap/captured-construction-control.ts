/**
 * Composes one captured construction cycle: city buildings and A.R.P.A. projects in a single
 * weighting order, sharing one set of holdings and one set of queue reservations.
 *
 * This is the whole vertical — validated input from the captured root, the existing pure planners,
 * captured game commands. The captured runtime selects it only after document-start capture is
 * complete; callers that cannot provide that capture reject before touching game-facing readers.
 */

import { createCapturedActionCostReader } from "../adapters/evolve/captured-action-costs.ts";
import { createCapturedAchievementSource } from "../adapters/evolve/captured-achievement-state.ts";
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
import type { ConstructionObservations } from "../ports/game-construction-observations.ts";
import type { ConstructionCycleOptions } from "../ports/construction-candidates.ts";
import type { BuildResourceScope } from "../domain/progression/build/build.ts";
import type { GameControlRegistry } from "../ports/game-control-registry.ts";
import type { GameActivitySink } from "../ports/game-message-log.ts";
import type { GameDrawnProjectsReader } from "../ports/game-drawn-projects.ts";
import type { GameMountSuppression } from "../ports/game-mount-suppression.ts";
import type { GamePanelWorkspace } from "../ports/game-panel-workspace.ts";
import type { CostReservationSource } from "../ports/game-cost-reservations.ts";
import type { GameRootStateSource } from "../ports/game-root-state.ts";
import type {
  GameProjectCatalog,
  OfferedProject,
} from "../ports/game-project-catalog.ts";
import type { OfferedTech } from "../ports/game-tech-catalog.ts";
import type { TickDiagnostics } from "../ports/tick.ts";
import type { KnowledgeGateLevels } from "../domain/progression/build/building-weighting.ts";

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
  /** Shared project catalog, so storage and construction consume one panel sample per cycle. */
  /**
   * Only the drawing half is used here; a caller that already owns a cached catalog passes its
   * `readProjects` and keeps the restatement on its own side.
   */
  readonly projectCatalog?: Pick<GameProjectCatalog, "readProjects">;
  /** Optional one-time discovery of the game's Civilization action controls. */
  readonly ensureBuildControls?: () => void;
  readonly readPolicy: () => CapturedConstructionPolicy;
  /** Persisted A.R.P.A. settings, normalized at the adapter boundary. */
  readonly readSettings: () => unknown;
  /** Script-derived commitments outside the captured game root. */
  readonly scriptReservations?: CostReservationSource;
  /** Script-computed Knowledge requirements combined with captured capacity. */
  readonly readKnowledgeGate?: () => KnowledgeGateLevels;
  /** Script storage-planner values, keyed by captured resource id. */
  readonly readStorageRequired?: (
    resourceIds: readonly string[],
    resourceScopes?: readonly BuildResourceScope[],
  ) => Readonly<Record<string, number>> | undefined;
  /**
   * The technologies the game is offering, which is the only captured route to a technology's
   * price. Supply it to make the player's research queue reserve what it is saving for; without it
   * this cycle cannot see that commitment and does not model it. It is asked for only when that
   * queue actually has an entry waiting, so an unused research queue costs nothing.
   */
  readonly readOfferedTechs?: () =>
    readonly Readonly<OfferedTech>[] | undefined;
  readonly diagnostics?: TickDiagnostics | undefined;
  /** Reports candidate and executor diagnostics when explicitly enabled by the caller. */
  readonly onDiagnostic?: (message: string) => void;
  /** Reports successful captured activity after the game state changed. */
  readonly onActivity?: GameActivitySink;
  /** Reports a candidate, price, or catalog the capture could not supply. */
  readonly onSkipped?: (key: string, reason: string) => void;
}

export interface CapturedConstructionControl {
  /** Runs one construction cycle. Safe to call before the game has created its state. */
  runCycle(): CommandExecutionOutcome;
  /** The most recently captured A.R.P.A. project snapshot, if one exists. */
  readonly readProjects: () => readonly Readonly<OfferedProject>[] | undefined;
  /** What the last completed cycle was saving for, for the features that read demand. */
  readonly observations: ConstructionObservations;
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
  const scriptReservations = dependencies.scriptReservations;
  const readKnowledgeGate = dependencies.readKnowledgeGate;
  const readStorageRequired = dependencies.readStorageRequired;
  const onDiagnostic = dependencies.onDiagnostic;
  const onActivity = dependencies.onActivity;
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
    costs,
    ...(readOfferedTechs === undefined
      ? {}
      : { readOfferedTechs: readOfferedTechsOnce }),
    ...(onSkipped === undefined ? {} : { onUnavailable: onSkipped }),
  });
  const conflicts = createCapturedCostConflictReader({
    resources,
    reservations,
    ...(scriptReservations === undefined
      ? {}
      : { additionalReservations: scriptReservations }),
  });
  const catalog =
    dependencies.projectCatalog ??
    createCapturedProjectCatalog({
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
      ...(onDiagnostic === undefined
        ? {}
        : {
            onDiagnostic: (reason: string) =>
              onDiagnostic(`progression diagnostic arpa: ${reason}`),
          }),
    });
  const { reader, executor, observations } = createCapturedConstructionAdapter({
    // City buildings first, matching the game's own list order, so a project only outranks a
    // building by weighting rather than by being sampled first.
    sources: Object.freeze([
      createCapturedBuildSource({
        rootState,
        controls,
        costs,
        readTargets: () => readPolicy().buildings,
        ...(dependencies.ensureBuildControls === undefined
          ? {}
          : { ensureControls: dependencies.ensureBuildControls }),
        ...(onSkipped === undefined ? {} : { onSkipped }),
        ...(onDiagnostic === undefined ? {} : { onDiagnostic }),
        ...(onActivity === undefined ? {} : { onActivity }),
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
          achievements: createCapturedAchievementSource(rootState),
          readSettings,
        }),
        readSettings,
        ...(onActivity === undefined ? {} : { onActivity }),
      }),
    ]),
    resources,
    rootState,
    conflicts,
    readOptions: readPolicy,
    ...(readKnowledgeGate === undefined ? {} : { readKnowledgeGate }),
    ...(readStorageRequired === undefined ? {} : { readStorageRequired }),
  });

  return Object.freeze({
    runCycle(): CommandExecutionOutcome {
      if (rootState.readRoot() === undefined) return NOT_CAPTURED;
      offeredThisCycle = undefined;
      try {
        return runBuildAutomation({
          reader,
          executor,
          diagnostics,
          ...(onDiagnostic === undefined ? {} : { onDiagnostic }),
        });
      } finally {
        offeredThisCycle = undefined;
      }
    },
    readProjects: () => catalog.readProjects(),
    observations,
  });
}
