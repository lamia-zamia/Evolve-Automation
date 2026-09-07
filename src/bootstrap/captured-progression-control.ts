/**
 * Production composition for the captured build and research families.
 *
 * This seam owns the adapter assembly for the captured tick path. The runtime selects it only after
 * document-start capture is complete and retains the compatibility controllers as a late-load
 * fallback. The composition deliberately shares the offered technology reader so a construction
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
import { createCapturedConstructionControl } from "./captured-construction-control.ts";
import { createCapturedResearchControl } from "./captured-research-control.ts";
import type { CommandExecutionOutcome } from "../domain/commands.ts";
import type { GameControlRegistry } from "../ports/game-control-registry.ts";
import type { GameDrawnActionsReader } from "../ports/game-drawn-actions.ts";
import type { GameDrawnProjectsReader } from "../ports/game-drawn-projects.ts";
import type { GameMountSuppression } from "../ports/game-mount-suppression.ts";
import type { GamePanelWorkspace } from "../ports/game-panel-workspace.ts";
import type { GameRootStateSource } from "../ports/game-root-state.ts";
import type { TickDiagnostics } from "../ports/tick.ts";

export interface CapturedProgressionControlDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly mountSuppression: GameMountSuppression;
  readonly panels: GamePanelWorkspace;
  readonly drawnActions: GameDrawnActionsReader;
  readonly drawnProjects: GameDrawnProjectsReader;
  readonly getBuildingManager: () => unknown;
  readonly readSettings: () => unknown;
  readonly getState: () => unknown;
  readonly getResources: () => unknown;
  readonly diagnostics?: TickDiagnostics | undefined;
  readonly onSkipped?: (key: string, reason: string) => void;
  readonly onUnavailable?: (reason: string) => void;
}

export interface CapturedProgressionControl {
  readonly runConstructionCycle: () => CommandExecutionOutcome;
  readonly runResearchCycle: () => CommandExecutionOutcome;
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
  const offered = createCapturedTechCatalog({
    rootState,
    discovery,
    drawnActions,
    controls,
    ...(onUnavailable === undefined ? {} : { onUnavailable }),
  });
  const readPolicy = createScriptBuildPolicyReader({
    getBuildingManager,
    getSettings: readSettings,
    ...(onSkipped === undefined ? {} : { onSkipped }),
  });
  const scriptReservations = createScriptCostReservationSource({ getState });
  const readKnowledgeGate = createScriptKnowledgeGateReader({
    getState,
    resources,
    getResources,
  });
  const readStorageRequired = createScriptStorageRequirementReader({
    getResources,
  });
  const construction = createCapturedConstructionControl({
    rootState,
    controls,
    mountSuppression,
    panels,
    drawnProjects,
    readPolicy,
    readSettings,
    ensureBuildControls,
    scriptReservations,
    readKnowledgeGate,
    readStorageRequired,
    readOfferedTechs: () => offered.readOffered(),
    ...(onSkipped === undefined ? {} : { onSkipped }),
    diagnostics,
  });
  const research = createCapturedResearchControl({
    rootState,
    controls,
    drawnActions,
    mountSuppression,
    panels,
    readOfferedTechs: () => offered.readOffered(),
    ...(onUnavailable === undefined ? {} : { onUnavailable }),
    diagnostics,
  });

  return Object.freeze({
    runConstructionCycle: () => construction.runCycle(),
    runResearchCycle: () => research.runCycle(),
  });
}
