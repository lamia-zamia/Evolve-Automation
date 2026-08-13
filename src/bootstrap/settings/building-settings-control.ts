import { createBuildingSettingsIntentHandler } from "../../application/building-settings.ts";
import {
  createBuildingSettingsBrowserAdapter,
  type BuildingSettingsBrowserActions,
} from "../../adapters/browser/building-settings.ts";
import { createBuildingSettingsEvolveAdapter } from "../../adapters/evolve/progression/build/building-settings.ts";

declare global {
  var __EA_TEST_SURFACE_ENABLED__: boolean;
}

interface RuntimeTestSurface {
  addContext(
    name: string,
    part: Record<string, unknown>,
    publicName?: string,
  ): void;
  getContext(name: string): unknown;
}

type RuntimeFunction = (...args: unknown[]) => unknown;
type BrowserDependencies = Parameters<
  typeof createBuildingSettingsBrowserAdapter
>[0];

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function readContextValue<T>(
  context: unknown,
  property: string,
  fallback: T,
): T {
  const value = readRecord(context)?.[property];
  return value === undefined ? fallback : (value as T);
}

function readContextActions<T>(context: unknown, fallback: T): T {
  const record = readRecord(context);
  if (record === undefined) return fallback;
  return record["actions"] === undefined
    ? (context as T)
    : (record["actions"] as T);
}

function getTestContextReader(testSurface: RuntimeTestSurface | undefined) {
  if (!globalThis.__EA_TEST_SURFACE_ENABLED__) return () => undefined;
  return (name: string): unknown => testSurface?.getContext(name);
}

interface BuildingSettingsControlDependencies {
  readonly getDocument: BrowserDependencies["getDocument"];
  readonly getJQuery: BrowserDependencies["getJQuery"];
  readonly actions: BuildingSettingsBrowserActions;
  readonly getBuildingManager: () => unknown;
  readonly getBuildingIds: () => unknown;
  readonly getResources: () => unknown;
  readonly getLinkedBuildings: () => unknown;
  readonly getCheckCompare: () => unknown;
  readonly getOverrideKey: () => unknown;
  readonly getRealNumber: () => unknown;
  readonly getInitBuildingState: () => unknown;
  readonly getSettingsRaw: () => unknown;
  readonly resetBuildingSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly resetCheckbox: (...keys: string[]) => unknown;
  readonly removeBuildingToggles: RuntimeFunction;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createBuildingSettingsControl({
  getDocument,
  getJQuery,
  actions,
  getBuildingManager,
  getBuildingIds,
  getResources,
  getLinkedBuildings,
  getCheckCompare,
  getOverrideKey,
  getRealNumber,
  getInitBuildingState,
  getSettingsRaw,
  resetBuildingSettings,
  persistSettings,
  resetCheckbox,
  removeBuildingToggles,
  testSurface,
}: BuildingSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("buildingSettings");
  const evolveAdapter = createBuildingSettingsEvolveAdapter({
    getBuildingManager: () =>
      readContextValue(context(), "BuildingManager", getBuildingManager()),
    getBuildingIds: () =>
      readContextValue(context(), "buildingIds", getBuildingIds()),
    getResources: () =>
      readContextValue(context(), "resources", getResources()),
    getLinkedBuildings: () =>
      readContextValue(context(), "linkedBuildings", getLinkedBuildings()),
    getCheckCompare: () =>
      readContextValue(context(), "checkCompare", getCheckCompare()),
    getOverrideKey: () =>
      readContextValue(context(), "overrideKey", getOverrideKey()),
    getRealNumber: () =>
      readContextValue(context(), "getRealNumber", getRealNumber()),
    getInitBuildingState: () =>
      readContextValue(context(), "initBuildingState", getInitBuildingState()),
    getSettingsRaw: () =>
      readContextValue(context(), "settingsRaw", getSettingsRaw()),
  });
  let intentHandler: ReturnType<typeof createBuildingSettingsIntentHandler>;
  const browserAdapter = createBuildingSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    getReadModel: () => evolveAdapter.readBuildingSettingsReadModel(),
    getFilterMatches: (query) => evolveAdapter.filterBuildingSettings(query),
    intents: {
      handle: (intent) => intentHandler.handle(intent),
    },
    getActions: () => readContextActions(context(), actions),
  });
  intentHandler = createBuildingSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetBuildingSettings",
          resetBuildingSettings,
        )(true),
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
      resetPriorities: () => evolveAdapter.resetPriorities(),
      reorderBuildings: (buildingIds) =>
        evolveAdapter.reorderBuildings(buildingIds),
      setAllAutoBuild: (enabled) => evolveAdapter.setAllAutoBuild(enabled),
      setAllAutoPower: (enabled) => evolveAdapter.setAllAutoPower(enabled),
      setLinkedSmartState: (buildingIds, enabled) =>
        evolveAdapter.setLinkedSmartState(buildingIds, enabled),
    },
    renderSettingsContent: () => browserAdapter.updateBuildingSettingsContent(),
    effects: {
      resetCheckboxes: () =>
        readContextValue(
          context(),
          "resetCheckbox",
          resetCheckbox,
        )("autoBuild", "autoPower"),
      removeBuildingToggles: () =>
        readContextValue(
          context(),
          "removeBuildingToggles",
          removeBuildingToggles,
        )(),
    },
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("buildingSettings", {
      buildingSettings: browserAdapter,
    });
  return browserAdapter;
}
