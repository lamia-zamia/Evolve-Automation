import { createPrestigeSettingsIntentHandler } from "../../application/prestige-settings.ts";
import {
  createPrestigeSettingsBrowserAdapter,
  type PrestigeSettingsBrowserActions,
} from "../../adapters/browser/prestige-settings.ts";
import { createPrestigeSettingsEvolveAdapter } from "../../adapters/evolve/progression/prestige/prestige-settings.ts";

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
  typeof createPrestigeSettingsBrowserAdapter
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

interface PrestigeSettingsControlDependencies {
  readonly getDocument: BrowserDependencies["getDocument"];
  readonly getJQuery: BrowserDependencies["getJQuery"];
  readonly actions: PrestigeSettingsBrowserActions;
  readonly getPrestigeTypes: () => unknown;
  readonly getGame: () => unknown;
  readonly getBuildings: () => unknown;
  readonly isPrestigeAllowed: () => unknown;
  readonly haveTech: (...args: unknown[]) => unknown;
  readonly isBioseederPrestigeAvailable: () => unknown;
  readonly isCataclysmPrestigeAvailable: () => unknown;
  readonly isWhiteholePrestigeAvailable: () => unknown;
  readonly isApocalypsePrestigeAvailable: () => unknown;
  readonly isAscensionPrestigeAvailable: () => unknown;
  readonly isWitchAscensionPrestigeAvailable: (demonic: unknown) => unknown;
  readonly isDemonicPrestigeAvailable: () => unknown;
  readonly resetPrestigeSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly getSettingsRaw: () => unknown;
  readonly getState: () => unknown;
  readonly confirm: (message: string) => unknown;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createPrestigeSettingsControl({
  getDocument,
  getJQuery,
  actions,
  getPrestigeTypes,
  getGame,
  getBuildings,
  isPrestigeAllowed,
  haveTech,
  isBioseederPrestigeAvailable,
  isCataclysmPrestigeAvailable,
  isWhiteholePrestigeAvailable,
  isApocalypsePrestigeAvailable,
  isAscensionPrestigeAvailable,
  isWitchAscensionPrestigeAvailable,
  isDemonicPrestigeAvailable,
  resetPrestigeSettings,
  persistSettings,
  getSettingsRaw,
  getState,
  confirm,
  testSurface,
}: PrestigeSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("prestigeSettings");
  const reader = createPrestigeSettingsEvolveAdapter({
    getPrestigeTypes: () =>
      readContextValue(context(), "prestigeTypes", getPrestigeTypes()),
    getGame: () => readContextValue(context(), "game", getGame()),
    getBuildings: () =>
      readContextValue(context(), "buildings", getBuildings()),
    isPrestigeAllowed: () =>
      readContextValue(context(), "isPrestigeAllowed", isPrestigeAllowed)(),
    haveTech: (...args) =>
      readContextValue(context(), "haveTech", haveTech)(...args),
    isBioseederPrestigeAvailable: () =>
      readContextValue(
        context(),
        "isBioseederPrestigeAvailable",
        isBioseederPrestigeAvailable,
      )(),
    isCataclysmPrestigeAvailable: () =>
      readContextValue(
        context(),
        "isCataclysmPrestigeAvailable",
        isCataclysmPrestigeAvailable,
      )(),
    isWhiteholePrestigeAvailable: () =>
      readContextValue(
        context(),
        "isWhiteholePrestigeAvailable",
        isWhiteholePrestigeAvailable,
      )(),
    isApocalypsePrestigeAvailable: () =>
      readContextValue(
        context(),
        "isApocalypsePrestigeAvailable",
        isApocalypsePrestigeAvailable,
      )(),
    isAscensionPrestigeAvailable: () =>
      readContextValue(
        context(),
        "isAscensionPrestigeAvailable",
        isAscensionPrestigeAvailable,
      )(),
    isWitchAscensionPrestigeAvailable: (demonic) =>
      readContextValue(
        context(),
        "isWitchAscensionPrestigeAvailable",
        isWitchAscensionPrestigeAvailable,
      )(demonic),
    isDemonicPrestigeAvailable: () =>
      readContextValue(
        context(),
        "isDemonicPrestigeAvailable",
        isDemonicPrestigeAvailable,
      )(),
  });
  const intentHandler = createPrestigeSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetPrestigeSettings",
          resetPrestigeSettings,
        )(true),
      setPrestigeType: (value) => {
        readContextValue<Record<string, unknown>>(
          context(),
          "settingsRaw",
          getSettingsRaw() as Record<string, unknown>,
        ).prestigeType = value;
      },
      setGoalStandard: () => {
        readContextValue<Record<string, unknown>>(
          context(),
          "state",
          getState() as Record<string, unknown>,
        ).goal = "Standard";
      },
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
    },
    reader,
    render: (secondaryPrefix) =>
      browserAdapter.updatePrestigeSettingsContent(secondaryPrefix),
    effects: {
      confirm: (message) =>
        Boolean(readContextValue(context(), "confirm", confirm)(message)),
    },
  });
  const browserAdapter = createPrestigeSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    reader,
    intents: intentHandler,
    getActions: () => readContextActions(context(), actions),
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("prestigeSettings", {
      prestigeSettings: browserAdapter,
    });
  return browserAdapter;
}
