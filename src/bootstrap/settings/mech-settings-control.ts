import { createMechSettingsIntentHandler } from "../../application/mech-settings.ts";
import {
  createMechSettingsBrowserAdapter,
  type MechSettingsBrowserActions,
} from "../../adapters/browser/mech-settings.ts";
import { createMechSettingsEvolveAdapter } from "../../adapters/evolve/combat/mech-settings.ts";

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
  typeof createMechSettingsBrowserAdapter
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

interface MechSettingsControlDependencies {
  readonly getDocument: BrowserDependencies["getDocument"];
  readonly getJQuery: BrowserDependencies["getJQuery"];
  readonly actions: MechSettingsBrowserActions;
  readonly getMechManager: () => unknown;
  readonly getGame: () => unknown;
  readonly resetMechSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly resetCheckbox: (...keys: string[]) => unknown;
  readonly removeMechInfo: RuntimeFunction;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createMechSettingsControl({
  getDocument,
  getJQuery,
  actions,
  getMechManager,
  getGame,
  resetMechSettings,
  persistSettings,
  resetCheckbox,
  removeMechInfo,
  testSurface,
}: MechSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("mechSettings");
  const reader = createMechSettingsEvolveAdapter({
    getMechManager: () =>
      readContextValue(context(), "MechManager", getMechManager()),
    getGame: () => readContextValue(context(), "game", getGame()),
  });
  const intentHandler = createMechSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetMechSettings",
          resetMechSettings,
        )(true),
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
    },
    renderSettingsContent: () => browserAdapter.updateMechSettingsContent(),
    effects: {
      resetCheckboxes: () =>
        readContextValue(context(), "resetCheckbox", resetCheckbox)("autoMech"),
      removeMechInfo: () =>
        readContextValue(context(), "removeMechInfo", removeMechInfo)(),
    },
  });
  const browserAdapter = createMechSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    reader,
    intents: intentHandler,
    getActions: () => readContextActions(context(), actions),
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("mechSettings", {
      mechSettings: browserAdapter,
    });
  return browserAdapter;
}
