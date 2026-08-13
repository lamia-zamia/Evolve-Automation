import { createGovernmentSettingsIntentHandler } from "../../application/government-settings.ts";
import { createPlanetSettingsIntentHandler } from "../../application/planet-settings.ts";
import {
  createGovernmentSettingsBrowserAdapter,
  type GovernmentSettingsBrowserActions,
} from "../../adapters/browser/government-settings.ts";
import {
  createPlanetSettingsBrowserAdapter,
  type PlanetSettingsBrowserActions,
} from "../../adapters/browser/planet-settings.ts";
import { createGovernmentSettingsEvolveAdapter } from "../../adapters/evolve/civic/government-settings.ts";
import { createPlanetSettingsEvolveAdapter } from "../../adapters/evolve/progression/evolution/planet-settings.ts";

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
type GovernmentBrowserDependencies = Parameters<
  typeof createGovernmentSettingsBrowserAdapter
>[0];
type PlanetBrowserDependencies = Parameters<
  typeof createPlanetSettingsBrowserAdapter
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

interface GovernmentSettingsControlDependencies {
  readonly getDocument: GovernmentBrowserDependencies["getDocument"];
  readonly getJQuery: GovernmentBrowserDependencies["getJQuery"];
  readonly actions: GovernmentSettingsBrowserActions;
  readonly getGame: () => unknown;
  readonly getGovernmentManager: () => unknown;
  readonly getGovernors: () => unknown;
  readonly resetGovernmentSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly resetCheckbox: (...keys: string[]) => unknown;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createGovernmentSettingsControl({
  getDocument,
  getJQuery,
  actions,
  getGame,
  getGovernmentManager,
  getGovernors,
  resetGovernmentSettings,
  persistSettings,
  resetCheckbox,
  testSurface,
}: GovernmentSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("governmentSettings");
  const evolveAdapter = createGovernmentSettingsEvolveAdapter({
    getGame: () => readContextValue(context(), "game", getGame()),
    getGovernmentManager: () =>
      readContextValue(context(), "GovernmentManager", getGovernmentManager()),
    getGovernors: () =>
      readContextValue(context(), "governors", getGovernors()),
  });
  let intentHandler: ReturnType<typeof createGovernmentSettingsIntentHandler>;
  const browserAdapter = createGovernmentSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    getReadModel: () => evolveAdapter.readGovernmentSettingsReadModel(),
    intents: {
      handle: (intent) => intentHandler.handle(intent),
    },
    getActions: () => readContextActions(context(), actions),
  });
  intentHandler = createGovernmentSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetGovernmentSettings",
          resetGovernmentSettings,
        )(true),
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
    },
    renderSettingsContent: (secondaryPrefix) =>
      browserAdapter.updateGovernmentSettingsContent(secondaryPrefix),
    effects: {
      resetCheckboxes: () =>
        readContextValue(
          context(),
          "resetCheckbox",
          resetCheckbox,
        )("autoTax", "autoGovernment"),
    },
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("governmentSettings", {
      governmentSettings: browserAdapter,
    });
  return browserAdapter;
}

interface PlanetSettingsControlDependencies {
  readonly getDocument: PlanetBrowserDependencies["getDocument"];
  readonly getJQuery: PlanetBrowserDependencies["getJQuery"];
  readonly actions: PlanetSettingsBrowserActions;
  readonly getGame: () => unknown;
  readonly getBiomeList: () => unknown;
  readonly getTraitList: () => unknown;
  readonly getExtraList: () => unknown;
  readonly resetPlanetSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createPlanetSettingsControl({
  getDocument,
  getJQuery,
  actions,
  getGame,
  getBiomeList,
  getTraitList,
  getExtraList,
  resetPlanetSettings,
  persistSettings,
  testSurface,
}: PlanetSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("planetSettings");
  const evolveAdapter = createPlanetSettingsEvolveAdapter({
    getGame: () => readContextValue(context(), "game", getGame()),
    getBiomeList: () =>
      readContextValue(context(), "biomeList", getBiomeList()),
    getTraitList: () =>
      readContextValue(context(), "traitList", getTraitList()),
    getExtraList: () =>
      readContextValue(context(), "extraList", getExtraList()),
  });
  let intentHandler: ReturnType<typeof createPlanetSettingsIntentHandler>;
  const browserAdapter = createPlanetSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    getReadModel: () => evolveAdapter.readPlanetSettingsReadModel(),
    intents: {
      handle: (intent) => intentHandler.handle(intent),
    },
    getActions: () => readContextActions(context(), actions),
  });
  intentHandler = createPlanetSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetPlanetSettings",
          resetPlanetSettings,
        )(true),
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
    },
    renderSettingsContent: () => browserAdapter.updatePlanetSettingsContent(),
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("planetSettings", {
      planetSettings: browserAdapter,
    });
  return browserAdapter;
}
