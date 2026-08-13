import { createEjectorSettingsIntentHandler } from "../../application/ejector-settings.ts";
import {
  createEjectorSettingsBrowserAdapter,
  type EjectorSettingsBrowserActions,
} from "../../adapters/browser/ejector-settings.ts";
import { createEjectorSettingsEvolveAdapter } from "../../adapters/evolve/economy/resources/ejector-settings.ts";

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
  typeof createEjectorSettingsBrowserAdapter
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

interface EjectorSettingsControlDependencies {
  readonly getDocument: BrowserDependencies["getDocument"];
  readonly getJQuery: BrowserDependencies["getJQuery"];
  readonly actions: EjectorSettingsBrowserActions;
  readonly getResources: () => unknown;
  readonly getEjectManager: () => unknown;
  readonly getNaniteManager: () => unknown;
  readonly getSupplyManager: () => unknown;
  readonly getSettingsRaw: () => unknown;
  readonly resetEjectorSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly resetCheckbox: (...keys: string[]) => unknown;
  readonly removeEjectToggles: RuntimeFunction;
  readonly removeSupplyToggles: RuntimeFunction;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createEjectorSettingsControl({
  getDocument,
  getJQuery,
  actions,
  getResources,
  getEjectManager,
  getNaniteManager,
  getSupplyManager,
  getSettingsRaw,
  resetEjectorSettings,
  persistSettings,
  resetCheckbox,
  removeEjectToggles,
  removeSupplyToggles,
  testSurface,
}: EjectorSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("ejectorSettings");
  const reader = createEjectorSettingsEvolveAdapter({
    getResources: () =>
      readContextValue(context(), "resources", getResources()),
    getEjectManager: () =>
      readContextValue(context(), "EjectManager", getEjectManager()),
    getNaniteManager: () =>
      readContextValue(context(), "NaniteManager", getNaniteManager()),
    getSupplyManager: () =>
      readContextValue(context(), "SupplyManager", getSupplyManager()),
    getSettingsRaw: () =>
      readContextValue(context(), "settingsRaw", getSettingsRaw()),
  });
  const intentHandler = createEjectorSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetEjectorSettings",
          resetEjectorSettings,
        )(true),
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
    },
    renderSettingsContent: () => browserAdapter.updateEjectorSettingsContent(),
    effects: {
      resetCheckboxes: () =>
        readContextValue(context(), "resetCheckbox", resetCheckbox)(
          "autoEject",
          "autoSupply",
          "autoNanite",
        ),
      removeEjectToggles: () =>
        readContextValue(context(), "removeEjectToggles", removeEjectToggles)(),
      removeSupplyToggles: () =>
        readContextValue(
          context(),
          "removeSupplyToggles",
          removeSupplyToggles,
        )(),
    },
  });
  const browserAdapter = createEjectorSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    reader,
    intents: intentHandler,
    getActions: () => readContextActions(context(), actions),
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("ejectorSettings", {
      ejectorSettings: browserAdapter,
    });
  return browserAdapter;
}
