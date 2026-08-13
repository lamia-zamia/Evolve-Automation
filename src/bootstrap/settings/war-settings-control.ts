import { createWarSettingsIntentHandler } from "../../application/war-settings.ts";
import {
  createWarSettingsBrowserAdapter,
  type WarSettingsBrowserActions,
} from "../../adapters/browser/war-settings.ts";
import { createWarSettingsEvolveAdapter } from "../../adapters/evolve/combat/war-settings.ts";

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
  typeof createWarSettingsBrowserAdapter
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

interface WarSettingsControlDependencies {
  readonly getDocument: BrowserDependencies["getDocument"];
  readonly getJQuery: BrowserDependencies["getJQuery"];
  readonly actions: WarSettingsBrowserActions;
  readonly getSpyManager: () => unknown;
  readonly getGame: () => unknown;
  readonly resetWarSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly resetCheckbox: (...keys: string[]) => unknown;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createWarSettingsControl({
  getDocument,
  getJQuery,
  actions,
  getSpyManager,
  getGame,
  resetWarSettings,
  persistSettings,
  resetCheckbox,
  testSurface,
}: WarSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("warSettings");
  const reader = createWarSettingsEvolveAdapter({
    getSpyManager: () =>
      readContextValue(context(), "SpyManager", getSpyManager()),
    getGame: () => readContextValue(context(), "game", getGame()),
  });
  const intentHandler = createWarSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(context(), "resetWarSettings", resetWarSettings)(true),
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
    },
    renderSettingsContent: (secondaryPrefix) =>
      browserAdapter.updateWarSettingsContent(secondaryPrefix),
    effects: {
      resetCheckboxes: () =>
        readContextValue(
          context(),
          "resetCheckbox",
          resetCheckbox,
        )("autoFight"),
    },
  });
  const browserAdapter = createWarSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    reader,
    intents: intentHandler,
    getActions: () => readContextActions(context(), actions),
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("warSettings", {
      warSettings: browserAdapter,
    });
  return browserAdapter;
}
