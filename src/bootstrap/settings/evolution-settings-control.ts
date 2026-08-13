import { createEvolutionSettingsIntentHandler } from "../../application/evolution-settings.ts";
import {
  createEvolutionSettingsBrowserAdapter,
  type EvolutionSettingsBrowserActions,
} from "../../adapters/browser/evolution-settings.ts";
import { createEvolutionSettingsEvolveAdapter } from "../../adapters/evolve/progression/evolution/evolution-settings.ts";

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
  typeof createEvolutionSettingsBrowserAdapter
>[0];
type EvolutionQueueEntry = Record<string, unknown>;
interface EvolutionSettingsRaw {
  [key: string]: unknown;
  evolutionQueue: (EvolutionQueueEntry | undefined)[];
}
interface EvolutionSettingsState {
  evolutionTarget: unknown;
}

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

interface EvolutionSettingsControlDependencies {
  readonly getDocument: BrowserDependencies["getDocument"];
  readonly getJQuery: BrowserDependencies["getJQuery"];
  readonly actions: EvolutionSettingsBrowserActions;
  readonly getGame: () => unknown;
  readonly getRaces: () => unknown;
  readonly getChallenges: () => unknown;
  readonly getUniverses: () => unknown;
  readonly getSettingsRaw: () => unknown;
  readonly getSettings: () => unknown;
  readonly getSettingsToStore: () => unknown;
  readonly getPrestigeTypes: () => unknown;
  readonly getStarLevel: (queueItem: unknown) => unknown;
  readonly getState: () => unknown;
  readonly resetEvolutionSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly resetCheckbox: (...keys: string[]) => unknown;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createEvolutionSettingsControl({
  getDocument,
  getJQuery,
  actions,
  getGame,
  getRaces,
  getChallenges,
  getUniverses,
  getSettingsRaw,
  getSettings,
  getSettingsToStore,
  getPrestigeTypes,
  getStarLevel,
  getState,
  resetEvolutionSettings,
  persistSettings,
  resetCheckbox,
  testSurface,
}: EvolutionSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("evolutionSettings");
  const reader = createEvolutionSettingsEvolveAdapter({
    getGame: () => readContextValue(context(), "game", getGame()),
    getRaces: () => readContextValue(context(), "races", getRaces()),
    getChallenges: () =>
      readContextValue(context(), "challenges", getChallenges()),
    getUniverses: () =>
      readContextValue(context(), "universes", getUniverses()),
    getSettingsRaw: () =>
      readContextValue(context(), "settingsRaw", getSettingsRaw()),
    getSettings: () => readContextValue(context(), "settings", getSettings()),
    getSettingsToStore: () =>
      readContextValue(
        context(),
        "evolutionSettingsToStore",
        getSettingsToStore(),
      ),
    getPrestigeTypes: () =>
      readContextValue(context(), "prestigeTypes", getPrestigeTypes()),
    getStarLevel: (queueItem) =>
      readContextValue(context(), "getStarLevel", getStarLevel)(queueItem),
  });
  let intentHandler: ReturnType<typeof createEvolutionSettingsIntentHandler>;
  const browserAdapter = createEvolutionSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    reader,
    intents: {
      handle: (intent) => intentHandler.handle(intent),
    },
    getActions: () => readContextActions(context(), actions),
  });
  intentHandler = createEvolutionSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetEvolutionSettings",
          resetEvolutionSettings,
        )(true),
      setTarget: (value) => {
        const target = readContextValue<EvolutionSettingsRaw>(
          context(),
          "settingsRaw",
          getSettingsRaw() as EvolutionSettingsRaw,
        );
        target.userEvolutionTarget = value;
        readContextValue<EvolutionSettingsState>(
          context(),
          "state",
          getState() as EvolutionSettingsState,
        ).evolutionTarget = null;
      },
      addCurrent: (prestigeType) => {
        const target = readContextValue<EvolutionSettingsRaw>(
          context(),
          "settingsRaw",
          getSettingsRaw() as EvolutionSettingsRaw,
        );
        const currentSettings = readContextValue<Record<string, unknown>>(
          context(),
          "settings",
          getSettings() as Record<string, unknown>,
        );
        const names = readContextValue<readonly string[]>(
          context(),
          "evolutionSettingsToStore",
          getSettingsToStore() as readonly string[],
        );
        const queued: EvolutionQueueEntry = {};
        for (const name of names)
          queued[name] = target[name] ?? currentSettings[name];
        if (prestigeType !== "auto") queued.prestigeType = prestigeType;
        target.evolutionQueue.push(queued);
      },
      remove: (index) => {
        readContextValue<EvolutionSettingsRaw>(
          context(),
          "settingsRaw",
          getSettingsRaw() as EvolutionSettingsRaw,
        ).evolutionQueue.splice(index, 1);
      },
      edit: (index, json) => {
        try {
          const value = JSON.parse(json);
          if (value && typeof value === "object" && !Array.isArray(value))
            readContextValue<EvolutionSettingsRaw>(
              context(),
              "settingsRaw",
              getSettingsRaw() as EvolutionSettingsRaw,
            ).evolutionQueue[index] = value as EvolutionQueueEntry;
        } catch {
          return;
        }
      },
      reorder: (indexes) => {
        const target = readContextValue<EvolutionSettingsRaw>(
          context(),
          "settingsRaw",
          getSettingsRaw() as EvolutionSettingsRaw,
        );
        target.evolutionQueue = indexes.map(
          (index) => target.evolutionQueue[index],
        );
      },
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
    },
    render: () => browserAdapter.updateEvolutionSettingsContent(),
    effects: {
      resetCheckbox: () =>
        readContextValue(
          context(),
          "resetCheckbox",
          resetCheckbox,
        )("autoEvolution"),
    },
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("evolutionSettings", {
      evolutionSettings: browserAdapter,
    });
  return {
    ...browserAdapter,
    addEvolutionSetting: () =>
      intentHandler.handle({ type: "add-evolution", prestigeType: "auto" }),
  };
}
