import { createResearchSettingsIntentHandler } from "../../application/research-settings.ts";
import {
  createResearchSettingsBrowserAdapter,
  type ResearchSettingsBrowserActions,
} from "../../adapters/browser/research-settings.ts";
import { createResearchSettingsEvolveAdapter } from "../../adapters/evolve/progression/research/research-settings.ts";

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
  typeof createResearchSettingsBrowserAdapter
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

interface ResearchSettingsControlDependencies {
  readonly getDocument: BrowserDependencies["getDocument"];
  readonly getJQuery: BrowserDependencies["getJQuery"];
  readonly actions: ResearchSettingsBrowserActions;
  readonly getGame: () => unknown;
  readonly getTechIds: () => unknown;
  readonly resetResearchSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly resetCheckbox: (...keys: string[]) => unknown;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createResearchSettingsControl({
  getDocument,
  getJQuery,
  actions,
  getGame,
  getTechIds,
  resetResearchSettings,
  persistSettings,
  resetCheckbox,
  testSurface,
}: ResearchSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("researchSettings");
  const evolveAdapter = createResearchSettingsEvolveAdapter({
    getGame: () => readContextValue(context(), "game", getGame()),
    getTechIds: () => readContextValue(context(), "techIds", getTechIds()),
  });
  let intentHandler: ReturnType<typeof createResearchSettingsIntentHandler>;
  const browserAdapter = createResearchSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    getReadModel: () => evolveAdapter.readResearchSettingsReadModel(),
    intents: {
      handle: (intent) => intentHandler.handle(intent),
    },
    getActions: () => readContextActions(context(), actions),
  });
  intentHandler = createResearchSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetResearchSettings",
          resetResearchSettings,
        )(true),
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
    },
    renderSettingsContent: () => browserAdapter.updateResearchSettingsContent(),
    effects: {
      resetCheckbox: () =>
        readContextValue(
          context(),
          "resetCheckbox",
          resetCheckbox,
        )("autoResearch"),
    },
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("researchSettings", {
      researchSettings: browserAdapter,
    });
  return browserAdapter;
}
