import { createHellSettingsIntentHandler } from "../../application/hell-settings.ts";
import {
  createHellSettingsBrowserAdapter,
  type HellSettingsBrowserActions,
} from "../../adapters/browser/hell-settings.ts";
import { getHellSettingsReadModel } from "../../domain/combat/hell-settings.ts";

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
  typeof createHellSettingsBrowserAdapter
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

interface HellSettingsControlDependencies {
  readonly getDocument: BrowserDependencies["getDocument"];
  readonly getJQuery: BrowserDependencies["getJQuery"];
  readonly actions: HellSettingsBrowserActions;
  readonly resetHellSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly resetCheckbox: (...keys: string[]) => unknown;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createHellSettingsControl({
  getDocument,
  getJQuery,
  actions,
  resetHellSettings,
  persistSettings,
  resetCheckbox,
  testSurface,
}: HellSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("hellSettings");
  const reader = { read: getHellSettingsReadModel };
  const intentHandler = createHellSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetHellSettings",
          resetHellSettings,
        )(true),
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
    },
    renderSettingsContent: (secondaryPrefix) =>
      browserAdapter.updateHellSettingsContent(secondaryPrefix),
    effects: {
      resetCheckboxes: () =>
        readContextValue(context(), "resetCheckbox", resetCheckbox)("autoHell"),
    },
  });
  const browserAdapter = createHellSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    reader,
    intents: intentHandler,
    getActions: () => readContextActions(context(), actions),
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("hellSettings", {
      hellSettings: browserAdapter,
    });
  return browserAdapter;
}
