import { createProductionSettingsIntentHandler } from "../../application/production-settings.ts";
import { createProductionSettingsBrowserAdapter } from "../../adapters/browser/production-settings.ts";
import { createProductionSettingsEvolveAdapter } from "../../adapters/evolve/economy/production/production-settings.ts";
import { CONSUMPTION_BALANCE_TARGET } from "../../config.ts";

declare global {
  var __EA_TEST_SURFACE_ENABLED__: boolean;
}

interface RuntimeTestSurface {
  add(part: Record<string, unknown>): void;
  getContext(name: string): unknown;
  setContext(name: string, context: unknown): void;
}

type RuntimeFunction = (...args: unknown[]) => unknown;
type BrowserDependencies = Parameters<
  typeof createProductionSettingsBrowserAdapter
>[0];
type ProductionSettingsActions = Omit<
  BrowserDependencies,
  "getDocument" | "getJQuery" | "getReadModel" | "intents"
>;

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

function getTestContextReader(testSurface: RuntimeTestSurface | undefined) {
  if (!globalThis.__EA_TEST_SURFACE_ENABLED__) return () => undefined;
  return (name: string): unknown => testSurface?.getContext(name);
}

interface ProductionSettingsControlDependencies {
  readonly getDocument: BrowserDependencies["getDocument"];
  readonly getJQuery: BrowserDependencies["getJQuery"];
  readonly actions: ProductionSettingsActions;
  readonly getResources: () => unknown;
  readonly getCraftablesList: () => unknown;
  readonly getSmelterManager: () => unknown;
  readonly getFactoryManager: () => unknown;
  readonly getDroidManager: () => unknown;
  readonly getReplicatorManager: () => unknown;
  readonly getSettingsRaw: () => unknown;
  readonly resetProductionSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly resetCheckbox: (...keys: string[]) => unknown;
  readonly removeCraftToggles: RuntimeFunction;
  readonly setSettingsRaw: (value: unknown) => void;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createProductionSettingsControl({
  getDocument,
  getJQuery,
  actions,
  getResources,
  getCraftablesList,
  getSmelterManager,
  getFactoryManager,
  getDroidManager,
  getReplicatorManager,
  getSettingsRaw,
  resetProductionSettings,
  persistSettings,
  resetCheckbox,
  removeCraftToggles,
  setSettingsRaw,
  testSurface,
}: ProductionSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("productionSettings");
  const evolveAdapter = createProductionSettingsEvolveAdapter({
    getResources: () =>
      readContextValue(context(), "resources", getResources()),
    getCraftablesList: () =>
      readContextValue(context(), "craftablesList", getCraftablesList()),
    getSmelterManager: () =>
      readContextValue(context(), "SmelterManager", getSmelterManager()),
    getFactoryManager: () =>
      readContextValue(context(), "FactoryManager", getFactoryManager()),
    getDroidManager: () =>
      readContextValue(context(), "DroidManager", getDroidManager()),
    getReplicatorManager: () =>
      readContextValue(context(), "ReplicatorManager", getReplicatorManager()),
    getSettingsRaw: () =>
      readContextValue(context(), "settingsRaw", getSettingsRaw()),
    consumptionBalanceTarget: CONSUMPTION_BALANCE_TARGET,
  });
  let intentHandler: ReturnType<typeof createProductionSettingsIntentHandler>;
  const browserAdapter = createProductionSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    getReadModel: () => evolveAdapter.readProductionSettingsReadModel(),
    intents: {
      handle: (intent) => intentHandler.handle(intent),
    },
    ...actions,
  });
  intentHandler = createProductionSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetProductionSettings",
          resetProductionSettings,
        )(true),
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
      reorderSmelterFuels: (fuelIds) =>
        evolveAdapter.reorderSmelterFuels(fuelIds),
    },
    renderSettingsContent: () =>
      browserAdapter.updateProductionSettingsContent(),
    effects: {
      resetCheckboxes: () =>
        readContextValue(context(), "resetCheckbox", resetCheckbox)(
          "autoQuarry",
          "autoMine",
          "autoExtractor",
          "autoGraphenePlant",
          "autoSmelter",
          "autoCraft",
          "autoFactory",
          "autoMiningDroid",
          "autoReplicator",
        ),
      removeCraftToggles: () =>
        readContextValue(context(), "removeCraftToggles", removeCraftToggles)(),
    },
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      productionSettings: {
        buildProductionSettings: browserAdapter.buildProductionSettings,
        updateProductionSettingsContent:
          browserAdapter.updateProductionSettingsContent,
        updateProductionTableSmelter:
          browserAdapter.updateProductionTableSmelter,
        updateProductionTableFoundry:
          browserAdapter.updateProductionTableFoundry,
        updateProductionTableFactory:
          browserAdapter.updateProductionTableFactory,
        updateProductionTableMiningDrone:
          browserAdapter.updateProductionTableMiningDrone,
        updateProductionTableReplicator:
          browserAdapter.updateProductionTableReplicator,
      },
      setProductionSettingsTestContext(contextValue: unknown) {
        const settings = readRecord(contextValue)?.["settingsRaw"];
        setSettingsRaw(settings);
        testSurface?.setContext("productionSettings", contextValue);
      },
    });
  return browserAdapter;
}
