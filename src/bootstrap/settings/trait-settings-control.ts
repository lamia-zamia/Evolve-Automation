import type { TableSorter } from "../../adapters/browser/table-sorter.ts";
import { createTraitSettingsIntentHandler } from "../../application/trait-settings.ts";
import { createTraitSettingsBrowserAdapter } from "../../adapters/browser/trait-settings.ts";
import { createTraitSettingsEvolveAdapter } from "../../adapters/evolve/traits/trait-settings.ts";

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
  typeof createTraitSettingsBrowserAdapter
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

function getTestContextReader(testSurface: RuntimeTestSurface | undefined) {
  if (!globalThis.__EA_TEST_SURFACE_ENABLED__) return () => undefined;
  return (name: string): unknown => testSurface?.getContext(name);
}

interface TraitSettingsControlDependencies {
  readonly getDocument: BrowserDependencies["getDocument"];
  readonly getJQuery: BrowserDependencies["getJQuery"];
  readonly getSettingsRaw: () => unknown;
  readonly setSettingsRaw: (value: unknown) => void;
  readonly getState: () => unknown;
  readonly getGame: () => unknown;
  readonly getRaces: () => unknown;
  readonly getResources: () => unknown;
  readonly getPoly: () => unknown;
  readonly getMinorTraitManager: () => unknown;
  readonly getMutableTraitManager: () => unknown;
  readonly getOcularPowerData: () => unknown;
  readonly getWishData: () => unknown;
  readonly getMutationCostMultipliers: () => unknown;
  readonly getTableSorter: () => TableSorter;
  readonly buildSettingsSection: BrowserDependencies["buildSettingsSection"];
  readonly addStandardHeading: BrowserDependencies["addStandardHeading"];
  readonly addSettingsSelect: BrowserDependencies["addSettingsSelect"];
  readonly addSettingsNumber: BrowserDependencies["addSettingsNumber"];
  readonly addSettingsToggle: BrowserDependencies["addSettingsToggle"];
  readonly addTableToggle: BrowserDependencies["addTableToggle"];
  readonly addTableInput: BrowserDependencies["addTableInput"];
  readonly buildTableLabel: BrowserDependencies["buildTableLabel"];
  readonly resetMinorTraitSettings: RuntimeFunction;
  readonly resetMutableTraitSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly resetCheckbox: (...keys: string[]) => unknown;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createTraitSettingsControl({
  getDocument,
  getJQuery,
  getSettingsRaw,
  setSettingsRaw,
  getState,
  getGame,
  getRaces,
  getResources,
  getPoly,
  getMinorTraitManager,
  getMutableTraitManager,
  getOcularPowerData,
  getWishData,
  getMutationCostMultipliers,
  getTableSorter,
  buildSettingsSection,
  addStandardHeading,
  addSettingsSelect,
  addSettingsNumber,
  addSettingsToggle,
  addTableToggle,
  addTableInput,
  buildTableLabel,
  resetMinorTraitSettings,
  resetMutableTraitSettings,
  persistSettings,
  resetCheckbox,
  testSurface,
}: TraitSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("traitSettings");
  const evolveAdapter = createTraitSettingsEvolveAdapter({
    getSettingsRaw: () =>
      readContextValue(context(), "settingsRaw", getSettingsRaw()),
    getState: () => readContextValue(context(), "state", getState()),
    getGame: () => readContextValue(context(), "game", getGame()),
    getRaces: () => readContextValue(context(), "races", getRaces()),
    getResources: () =>
      readContextValue(context(), "resources", getResources()),
    getPoly: () => readContextValue(context(), "poly", getPoly()),
    getMinorTraitManager: () =>
      readContextValue(context(), "MinorTraitManager", getMinorTraitManager()),
    getMutableTraitManager: () =>
      readContextValue(
        context(),
        "MutableTraitManager",
        getMutableTraitManager(),
      ),
    getOcularPowerData,
    getWishData,
    getMutationCostMultipliers,
  });
  let intentHandler: ReturnType<typeof createTraitSettingsIntentHandler>;
  const browserAdapter = createTraitSettingsBrowserAdapter({
    getReadModel: () => evolveAdapter.readTraitSettingsReadModel(),
    getDocument,
    getJQuery,
    intents: {
      handle: (intent) => intentHandler.handle(intent),
    },
    getTableSorter,
    buildSettingsSection,
    addStandardHeading,
    addSettingsSelect,
    addSettingsNumber,
    addSettingsToggle,
    addTableToggle,
    addTableInput,
    buildTableLabel,
  });
  intentHandler = createTraitSettingsIntentHandler({
    writer: {
      resetMinorTraits: () =>
        readContextValue(
          context(),
          "resetMinorTraitSettings",
          resetMinorTraitSettings,
        )(true),
      resetMutableTraits: () =>
        readContextValue(
          context(),
          "resetMutableTraitSettings",
          resetMutableTraitSettings,
        )(true),
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
      clearEvolutionTarget: () => evolveAdapter.clearEvolutionTarget(),
      reorderMinorTraits: (traitIds) =>
        evolveAdapter.reorderMinorTraits(traitIds),
      reorderMutableTraits: (traitIds) =>
        evolveAdapter.reorderMutableTraits(traitIds),
      setBoolean: (settingName, value) =>
        evolveAdapter.setBoolean(settingName, value),
    },
    renderSettingsContent: () => browserAdapter.updateTraitSettingsContent(),
    effects: {
      resetCheckboxes: () =>
        readContextValue(context(), "resetCheckbox", resetCheckbox)(
          "autoMinorTrait",
          "autoMutateTraits",
          "autoGenetics",
        ),
    },
  });
  const result = {
    ...browserAdapter,
  };
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      traitSettings: result,
      setTraitSettingsTestContext(contextValue: unknown) {
        const record = readRecord(contextValue);
        if (record?.["settingsRaw"] !== undefined)
          setSettingsRaw(record["settingsRaw"]);
        testSurface?.setContext("traitSettings", contextValue);
      },
    });
  return result;
}
