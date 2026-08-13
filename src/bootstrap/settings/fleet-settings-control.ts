import { createFleetSettingsIntentHandler } from "../../application/fleet-settings.ts";
import {
  createFleetSettingsBrowserAdapter,
  type FleetSettingsBrowserActions,
} from "../../adapters/browser/fleet-settings.ts";
import { createFleetSettingsEvolveAdapter } from "../../adapters/evolve/combat/fleet-settings.ts";

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
  typeof createFleetSettingsBrowserAdapter
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

interface FleetSettingsControlDependencies {
  readonly getDocument: BrowserDependencies["getDocument"];
  readonly getJQuery: BrowserDependencies["getJQuery"];
  readonly actions: FleetSettingsBrowserActions;
  readonly getFleetManagerOuter: () => unknown;
  readonly getGalaxyRegions: () => unknown;
  readonly getGame: () => unknown;
  readonly getSettingsRaw: () => unknown;
  readonly resetFleetSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly resetCheckbox: (...keys: string[]) => unknown;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createFleetSettingsControl({
  getDocument,
  getJQuery,
  actions,
  getFleetManagerOuter,
  getGalaxyRegions,
  getGame,
  getSettingsRaw,
  resetFleetSettings,
  persistSettings,
  resetCheckbox,
  testSurface,
}: FleetSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("fleetSettings");
  const reader = createFleetSettingsEvolveAdapter({
    getFleetManagerOuter: () =>
      readContextValue(context(), "FleetManagerOuter", getFleetManagerOuter()),
    getGalaxyRegions: () =>
      readContextValue(context(), "galaxyRegions", getGalaxyRegions()),
    getGame: () => readContextValue(context(), "game", getGame()),
    getSettingsRaw: () =>
      readContextValue(context(), "settingsRaw", getSettingsRaw()),
  });
  let intentHandler: ReturnType<typeof createFleetSettingsIntentHandler>;
  const browserAdapter = createFleetSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    reader,
    intents: {
      handle: (intent) => intentHandler.handle(intent),
    },
    getActions: () => readContextActions(context(), actions),
  });
  intentHandler = createFleetSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetFleetSettings",
          resetFleetSettings,
        )(true),
      reorderAndromeda: (regionIds) => {
        const target = readContextValue<Record<string, unknown>>(
          context(),
          "settingsRaw",
          getSettingsRaw() as Record<string, unknown>,
        );
        regionIds.forEach((regionId, index) => {
          target[`fleet_pr_${regionId}`] = index;
        });
      },
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
    },
    render: (secondaryPrefix) =>
      browserAdapter.updateFleetSettingsContent(secondaryPrefix),
    effects: {
      resetCheckbox: () =>
        readContextValue(
          context(),
          "resetCheckbox",
          resetCheckbox,
        )("autoFleet"),
    },
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("fleetSettings", {
      fleetSettings: browserAdapter,
    });
  return browserAdapter;
}
