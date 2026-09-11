/**
 * Production composition for the captured build and research families.
 *
 * This seam owns the adapter assembly for the captured tick path. The runtime selects it only after
 * document-start capture is complete. The legacy composition remains available to characterization
 * callers, but the normal entry point does not use it. The composition deliberately shares the offered technology reader so a construction
 * reservation sample and a research plan describe one draw.
 */

import { createCapturedResourceSource } from "../adapters/evolve/captured-world-state.ts";
import {
  createCapturedTabDiscovery,
  MAIN_TAB_CONTROL,
  MAIN_TAB_SETTING,
  SUB_TAB_CONTROLS,
} from "../adapters/evolve/captured-tab-discovery.ts";
import {
  createScriptKnowledgeGateReader,
  createScriptStorageRequirementReader,
} from "../adapters/evolve/script-build-gates.ts";
import { createScriptCostReservationSource } from "../adapters/evolve/script-cost-reservations.ts";
import { createScriptBuildPolicyReader } from "../adapters/evolve/progression/build/script-build-policy.ts";
import { createCapturedTechCatalog } from "../adapters/evolve/progression/research/captured-tech-catalog.ts";
import { createCapturedProjectCatalog } from "../adapters/evolve/progression/research/captured-project-catalog.ts";
import { createCapturedBuildPolicyReader } from "../adapters/evolve/progression/build/captured-build-policy.ts";
import { createCapturedKnowledgeReader } from "../adapters/evolve/progression/build/captured-knowledge-gate.ts";
import { createCapturedConstructionControl } from "./captured-construction-control.ts";
import { createCapturedResearchControl } from "./captured-research-control.ts";
import { SAVING_CONFLICT_CAUSE } from "../domain/progression/build/build.ts";
import type { CommandExecutionOutcome } from "../domain/commands.ts";
import type { CostReservationSource } from "../ports/game-cost-reservations.ts";
import type { GameActionCostReader } from "../ports/game-action-costs.ts";
import type { ConstructionObservations } from "../ports/game-construction-observations.ts";
import type { GameControlRegistry } from "../ports/game-control-registry.ts";
import type { GameBuildTarget } from "../ports/game-build-targets.ts";
import type { GameDrawnActionsReader } from "../ports/game-drawn-actions.ts";
import type { GameDrawnProjectsReader } from "../ports/game-drawn-projects.ts";
import type { GameMountSuppression } from "../ports/game-mount-suppression.ts";
import type { GamePanelWorkspace } from "../ports/game-panel-workspace.ts";
import type { GameRootStateSource } from "../ports/game-root-state.ts";
import type {
  GameProjectCatalog,
  OfferedProject,
} from "../ports/game-project-catalog.ts";
import type { OfferedTech } from "../ports/game-tech-catalog.ts";
import type { TickDiagnostics } from "../ports/tick.ts";

export interface CapturedProgressionControlDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly mountSuppression: GameMountSuppression;
  readonly panels: GamePanelWorkspace;
  readonly drawnActions: GameDrawnActionsReader;
  readonly drawnProjects: GameDrawnProjectsReader;
  /** Prices captured mission controls for the build weighting adapter. */
  readonly costs?: GameActionCostReader;
  /** Persisted script settings. Required: without them nothing is managed and nothing is built. */
  readonly readSettings: () => unknown;
  /**
   * Legacy script inputs. The captured path deliberately runs without all three: it plans its own
   * build policy, has no script cost reservations, leaves the Knowledge gate ungated and leaves
   * storage requirements unknown. Each absence is the conservative direction, and each is a feature
   * still to migrate rather than missing wiring.
   */
  readonly getBuildingManager?: () => unknown;
  readonly getState?: () => unknown;
  readonly getResources?: () => unknown;
  /**
   * Captured storage requirements, from the same commitments the demand sample plans over. Absent
   * for a caller with no demand sample; the cycle then leaves storage requirements unknown, which
   * is not the same as zero.
   */
  readonly readCapturedStorageRequired?: (
    resourceIds: readonly string[],
  ) => Readonly<Record<string, number>> | undefined;
  readonly diagnostics?: TickDiagnostics | undefined;
  readonly onSkipped?: (key: string, reason: string) => void;
  readonly onUnavailable?: (reason: string) => void;
}

export interface CapturedProgressionControl {
  readonly runConstructionCycle: () => CommandExecutionOutcome;
  readonly runResearchCycle: () => CommandExecutionOutcome;
  /** The most recently captured offered-technology snapshot, if one exists. */
  readonly readOfferedTechs: () => readonly Readonly<OfferedTech>[] | undefined;
  /** A fresh captured A.R.P.A. project snapshot, if it can be read. */
  readonly readProjects: () => readonly Readonly<OfferedProject>[] | undefined;
  /** What the last construction cycle was saving for, for the features that read demand. */
  readonly observations: ConstructionObservations;
  /** Managed captured construction targets, used by production modes that weight against builds. */
  readonly readManagedBuildTargets: () => readonly Readonly<GameBuildTarget>[];
  /**
   * Discovers the construction action controls once, for features that act on build actions
   * without running the construction cycle.
   */
  readonly ensureBuildControls: () => void;
}

const NO_RESERVATIONS = Object.freeze({
  targets: Object.freeze([]),
  unavailable: false,
});

/** Before the construction cycle exists there is nothing to observe. */
const NO_OBSERVATIONS: ConstructionObservations = Object.freeze({
  readSavingTarget: () => null,
  readKnowledgeRequirement: () => 0,
});

/** Both sets are in force at once; either being unpriceable makes the whole set incomplete. */
function combineReservations(
  first: CostReservationSource,
  second: CostReservationSource,
): CostReservationSource {
  return Object.freeze({
    readReservations() {
      const left = first.readReservations();
      const right = second.readReservations();
      return Object.freeze({
        unavailable: left.unavailable || right.unavailable,
        targets: Object.freeze([...left.targets, ...right.targets]),
      });
    },
  });
}

export function createCapturedProgressionControl(
  dependencies: CapturedProgressionControlDependencies,
): CapturedProgressionControl {
  const {
    rootState,
    controls,
    mountSuppression,
    panels,
    drawnActions,
    drawnProjects,
    getBuildingManager,
    readSettings,
    getState,
    getResources,
    diagnostics,
  } = dependencies;
  const onSkipped = dependencies.onSkipped;
  const onUnavailable = dependencies.onUnavailable;
  const resources = createCapturedResourceSource(rootState);
  const discovery = createCapturedTabDiscovery({
    rootState,
    controls,
    mountSuppression,
    panels,
  });
  let buildControlsDiscoveryAttempted = false;
  const ensureBuildControls = () => {
    if (buildControlsDiscoveryAttempted) return;
    if (controls.resolve(MAIN_TAB_CONTROL) === undefined) return;
    buildControlsDiscoveryAttempted = true;
    const main = Object.freeze({
      setting: MAIN_TAB_SETTING,
      control: MAIN_TAB_CONTROL,
      index: 1,
    });
    const spaceTabControl = SUB_TAB_CONTROLS.spaceTabs;
    if (spaceTabControl === undefined) {
      onSkipped?.("build-discovery", "space-tab control is unavailable");
      return;
    }
    const paths = [
      Object.freeze([main]),
      ...Array.from({ length: 9 }, (_, index) =>
        Object.freeze([
          main,
          Object.freeze({
            setting: "spaceTabs",
            control: spaceTabControl,
            index: index + 1,
          }),
        ]),
      ),
    ];
    for (const path of paths) {
      const result = discovery.discover(path);
      if (result.outcome.status !== "succeeded") {
        onSkipped?.(
          "build-discovery",
          result.outcome.failure?.message ?? result.outcome.status,
        );
      }
    }
  };
  // The catalog a discovery pass already paid for, shared with the Knowledge gate so it never buys
  // one of its own. It is the last catalog read, which may be the previous cycle's.
  let lastOffered: readonly Readonly<OfferedTech>[] | undefined;
  const readOfferedTechs = () => {
    const value = offered.readOffered();
    if (value !== undefined) lastOffered = value;
    return value;
  };
  const offered = createCapturedTechCatalog({
    rootState,
    discovery,
    drawnActions,
    controls,
    ...(onUnavailable === undefined ? {} : { onUnavailable }),
  });
  const projectCatalog: GameProjectCatalog = createCapturedProjectCatalog({
    rootState,
    discovery,
    drawnProjects,
    controls,
    ...(onSkipped === undefined
      ? {}
      : { onUnavailable: (reason: string) => onSkipped("arpa", reason) }),
  });
  let projectSampled = false;
  let lastProjects: readonly Readonly<OfferedProject>[] | undefined;
  const readProjects = () => {
    if (!projectSampled) {
      projectSampled = true;
      lastProjects = projectCatalog.readProjects();
    }
    return lastProjects;
  };
  const readKnowledge = createCapturedKnowledgeReader({
    rootState,
    resources,
    readLastOfferedTechs: () => lastOffered,
    readBuildRequirement: () => readObservations().readKnowledgeRequirement(),
  });
  const readPolicy =
    getBuildingManager === undefined
      ? createCapturedBuildPolicyReader({
          rootState,
          controls,
          getSettings: readSettings,
          readKnowledge,
          ...(dependencies.costs === undefined
            ? {}
            : { costs: dependencies.costs }),
          ...(onSkipped === undefined ? {} : { onSkipped }),
        })
      : createScriptBuildPolicyReader({
          getBuildingManager,
          getSettings: readSettings,
          ...(onSkipped === undefined ? {} : { onSkipped }),
        });
  // The cycle's own saving target is a commitment like any other: without it in force, the cheaper
  // candidates that arrive first spend exactly the resources it is accumulating. It is the previous
  // cycle's judgement, so the target itself is never blocked by it once it becomes affordable —
  // the cycle that finds it affordable stops naming it.
  // Late-bound because the cycle both reads these observations and produces them; the reader is a
  // closure rather than a mutable object so nothing can hold a stale reference to one.
  let readObservations: () => ConstructionObservations = () => NO_OBSERVATIONS;
  const savingReservations: CostReservationSource = Object.freeze({
    readReservations() {
      const target = readObservations().readSavingTarget();
      return target === null
        ? NO_RESERVATIONS
        : Object.freeze({
            unavailable: false,
            targets: Object.freeze([
              Object.freeze({
                name: target.name,
                cause: SAVING_CONFLICT_CAUSE,
                cost: target.cost,
              }),
            ]),
          });
    },
  });
  const stateReservations =
    getState === undefined
      ? undefined
      : createScriptCostReservationSource({ getState });
  const scriptReservations =
    stateReservations === undefined
      ? savingReservations
      : combineReservations(stateReservations, savingReservations);
  const readKnowledgeGate =
    getState === undefined
      ? () => readKnowledge().levels
      : createScriptKnowledgeGateReader({
          getState,
          resources,
          ...(getResources === undefined ? {} : { getResources }),
        });
  const readStorageRequired =
    getResources === undefined
      ? dependencies.readCapturedStorageRequired
      : createScriptStorageRequirementReader({ getResources });
  const construction = createCapturedConstructionControl({
    rootState,
    controls,
    mountSuppression,
    panels,
    drawnProjects,
    projectCatalog: Object.freeze({ readProjects }),
    readPolicy,
    readSettings,
    ensureBuildControls,
    scriptReservations,
    readKnowledgeGate,
    ...(readStorageRequired === undefined ? {} : { readStorageRequired }),
    readOfferedTechs,
    ...(onSkipped === undefined ? {} : { onSkipped }),
    diagnostics,
  });
  const research = createCapturedResearchControl({
    rootState,
    controls,
    drawnActions,
    mountSuppression,
    panels,
    readOfferedTechs,
    ...(onUnavailable === undefined ? {} : { onUnavailable }),
    diagnostics,
  });

  readObservations = () => construction.observations;

  const readManagedBuildTargets = () => {
    ensureBuildControls();
    return readPolicy().buildings;
  };

  return Object.freeze({
    runConstructionCycle: () => {
      try {
        return construction.runCycle();
      } finally {
        projectSampled = false;
        lastProjects = undefined;
      }
    },
    runResearchCycle: () => research.runCycle(),
    readOfferedTechs: () => lastOffered,
    readProjects,
    observations: construction.observations,
    readManagedBuildTargets,
    ensureBuildControls,
  });
}
