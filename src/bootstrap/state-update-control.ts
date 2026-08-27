import { runStateUpdate } from "../application/state-update.ts";
import {
  createStateUpdateReader,
  createStateUpdateControls,
} from "../adapters/evolve/state-update.ts";
import { createActiveTargetsControls } from "../adapters/browser/active-targets.ts";

declare global {
  var __EA_TEST_SURFACE_ENABLED__: boolean;
}

interface RuntimeTestSurface {
  add(part: Record<string, unknown>): void;
}

type ReaderDependencies = Parameters<typeof createStateUpdateReader>[0];
type ActiveTargetsDependencies = Parameters<
  typeof createActiveTargetsControls
>[0];
type ControlsDependencies = Parameters<typeof createStateUpdateControls>[0];

interface StateUpdateTestHelpers {
  readonly checkEvolutionResult: ControlsDependencies["checkEvolutionResult"];
  readonly updateTriggerSettingsContent: ControlsDependencies["updateTriggerSettingsContent"];
  readonly updatePriorityTargets: ControlsDependencies["updatePriorityTargets"];
  readonly calculateRequiredStorages: ControlsDependencies["calculateRequiredStorages"];
  readonly prioritizeDemandedResources: ControlsDependencies["prioritizeDemandedResources"];
  readonly updateActiveTargetsUI: ActiveTargetsDependencies["updateActiveTargetsUI"];
}

interface StateUpdateControlDependencies {
  readonly getJQuery: ActiveTargetsDependencies["getJQuery"];
  readonly getGame: ReaderDependencies["getGame"];
  readonly getState: ControlsDependencies["getState"];
  readonly getActiveState: ActiveTargetsDependencies["getState"];
  readonly getSettingsRaw: ReaderDependencies["getSettingsRaw"];
  readonly getSettings: ActiveTargetsDependencies["getSettings"];
  readonly getResources: ControlsDependencies["getResources"];
  readonly getBuildings: ControlsDependencies["getBuildings"];
  readonly getStorageManager: ControlsDependencies["getStorageManager"];
  readonly getTriggerManager: ActiveTargetsDependencies["getTriggerManager"];
  readonly getPoly: ControlsDependencies["getPoly"];
  readonly checkEvolutionResult: ControlsDependencies["checkEvolutionResult"];
  readonly updateTriggerSettingsContent: ControlsDependencies["updateTriggerSettingsContent"];
  readonly updatePriorityTargets: ControlsDependencies["updatePriorityTargets"];
  readonly updateProjects: ControlsDependencies["updateProjects"];
  readonly calculateRequiredStorages: ControlsDependencies["calculateRequiredStorages"];
  readonly prioritizeDemandedResources: ControlsDependencies["prioritizeDemandedResources"];
  readonly updateActiveTargetsUI: ActiveTargetsDependencies["updateActiveTargetsUI"];
  readonly isTechnology: ActiveTargetsDependencies["isTechnology"];
  readonly isProject: ActiveTargetsDependencies["isProject"];
  readonly clock: Parameters<typeof runStateUpdate>[0]["clock"];
  readonly diagnostics: Parameters<typeof runStateUpdate>[0]["diagnostics"];
  readonly testSurface: RuntimeTestSurface | undefined;
  readonly setTestContext: (context: unknown) => void;
  readonly makeStateUpdateTargets: () => unknown;
}

export function createStateUpdateControl({
  getGame,
  getJQuery,
  getState,
  getActiveState,
  getSettingsRaw,
  getSettings,
  getResources,
  getBuildings,
  getStorageManager,
  getTriggerManager,
  getPoly,
  checkEvolutionResult,
  updateTriggerSettingsContent,
  updatePriorityTargets,
  updateProjects,
  calculateRequiredStorages,
  prioritizeDemandedResources,
  updateActiveTargetsUI,
  isTechnology,
  isProject,
  clock,
  diagnostics,
  testSurface,
  setTestContext,
  makeStateUpdateTargets,
}: StateUpdateControlDependencies) {
  let testHelpers: StateUpdateTestHelpers | undefined;
  const activeHelpers = (): StateUpdateTestHelpers =>
    testHelpers ?? {
      checkEvolutionResult,
      updateTriggerSettingsContent,
      updatePriorityTargets,
      calculateRequiredStorages,
      prioritizeDemandedResources,
      updateActiveTargetsUI,
    };
  const reader = createStateUpdateReader({
    getGame,
    getState,
    getSettingsRaw,
    getResources,
  });
  const activeTargets = createActiveTargetsControls({
    getJQuery,
    getSettings,
    getState: getActiveState,
    getTriggerManager,
    updateActiveTargetsUI: (targets, type) =>
      activeHelpers().updateActiveTargetsUI(targets, type),
    isTechnology,
    isProject,
  });
  const controls = createStateUpdateControls({
    getState,
    getResources,
    getBuildings,
    getStorageManager,
    getPoly,
    checkEvolutionResult: () => activeHelpers().checkEvolutionResult(),
    updateTriggerSettingsContent: () =>
      activeHelpers().updateTriggerSettingsContent(),
    updatePriorityTargets: () => activeHelpers().updatePriorityTargets(),
    updateProjects,
    calculateRequiredStorages: () =>
      activeHelpers().calculateRequiredStorages(),
    prioritizeDemandedResources: () =>
      activeHelpers().prioritizeDemandedResources(),
    updateActiveTargets: () => activeTargets.updateActiveTargets(),
    diagnostics,
  });
  const updateState = () =>
    runStateUpdate({ reader, controls, clock, diagnostics });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      updateState,
      makeStateUpdateTargets,
      setStateUpdateTestContext(context: unknown) {
        const record = context as Record<string, unknown>;
        testHelpers = record["helpers"] as StateUpdateTestHelpers;
        setTestContext(context);
      },
    });
  return { updateState };
}
