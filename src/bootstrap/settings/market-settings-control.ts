import { createMarketSettingsIntentHandler } from "../../application/market-settings.ts";
import {
  createMarketSettingsBrowserAdapter,
  type MarketSettingsBrowserActions,
} from "../../adapters/browser/market-settings.ts";
import {
  createMarketSettingsEvolveAdapter,
  createMarketSettingsWriter,
} from "../../adapters/evolve/economy/market/market-settings.ts";

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
  typeof createMarketSettingsBrowserAdapter
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

interface MarketSettingsControlDependencies {
  readonly getDocument: BrowserDependencies["getDocument"];
  readonly getJQuery: BrowserDependencies["getJQuery"];
  readonly actions: MarketSettingsBrowserActions;
  readonly getMarketManager: () => unknown;
  readonly getResources: () => unknown;
  readonly getPoly: () => unknown;
  readonly getSettingsRaw: () => unknown;
  readonly resetMarketSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly resetCheckbox: (...keys: string[]) => unknown;
  readonly removeMarketToggles: RuntimeFunction;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createMarketSettingsControl({
  getDocument,
  getJQuery,
  actions,
  getMarketManager,
  getResources,
  getPoly,
  getSettingsRaw,
  resetMarketSettings,
  persistSettings,
  resetCheckbox,
  removeMarketToggles,
  testSurface,
}: MarketSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("marketSettings");
  const reader = createMarketSettingsEvolveAdapter({
    getMarketManager: () =>
      readContextValue(context(), "MarketManager", getMarketManager()),
    getResources: () =>
      readContextValue(context(), "resources", getResources()),
    getPoly: () => readContextValue(context(), "poly", getPoly()),
  });
  const reorderer = createMarketSettingsWriter({
    getMarketManager: () =>
      readContextValue(context(), "MarketManager", getMarketManager()),
    getSettingsRaw: () =>
      readContextValue(context(), "settingsRaw", getSettingsRaw()),
  });
  const intentHandler = createMarketSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetMarketSettings",
          resetMarketSettings,
        )(true),
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
      reorderResources: (resourceIds) =>
        reorderer.reorderResources(resourceIds),
    },
    renderSettingsContent: () => browserAdapter.updateMarketSettingsContent(),
    effects: {
      resetCheckboxes: () =>
        readContextValue(
          context(),
          "resetCheckbox",
          resetCheckbox,
        )("autoMarket", "autoGalaxyMarket"),
      removeMarketToggles: () =>
        readContextValue(
          context(),
          "removeMarketToggles",
          removeMarketToggles,
        )(),
    },
  });
  const browserAdapter = createMarketSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    reader,
    intents: intentHandler,
    getActions: () => readContextActions(context(), actions),
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("marketSettings", {
      marketSettings: browserAdapter,
    });
  return browserAdapter;
}
