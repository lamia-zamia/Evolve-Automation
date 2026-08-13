import { createProjectSettingsIntentHandler } from "../../application/project-settings.ts";
import { createStorageSettingsIntentHandler } from "../../application/storage-settings.ts";
import { createMagicSettingsIntentHandler } from "../../application/magic-settings.ts";
import { createJobSettingsIntentHandler } from "../../application/job-settings.ts";
import { createWeightingSettingsIntentHandler } from "../../application/weighting-settings.ts";
import { createGeneralSettingsIntentHandler } from "../../application/general-settings.ts";
import { createLoggingSettingsIntentHandler } from "../../application/logging-settings.ts";
import {
  createProjectSettingsBrowserAdapter,
  type ProjectSettingsBrowserActions,
} from "../../adapters/browser/project-settings.ts";
import {
  createStorageSettingsBrowserAdapter,
  type StorageSettingsBrowserActions,
} from "../../adapters/browser/storage-settings.ts";
import {
  createMagicSettingsBrowserAdapter,
  type MagicSettingsBrowserActions,
} from "../../adapters/browser/magic-settings.ts";
import {
  createJobSettingsBrowserAdapter,
  type JobSettingsBrowserActions,
} from "../../adapters/browser/job-settings.ts";
import {
  createWeightingSettingsBrowserAdapter,
  type WeightingSettingsBrowserActions,
} from "../../adapters/browser/weighting-settings.ts";
import {
  createGeneralSettingsBrowserAdapter,
  type GeneralSettingsBrowserActions,
} from "../../adapters/browser/general-settings.ts";
import {
  createLoggingSettingsBrowserAdapter,
  type LoggingSettingsBrowserActions,
} from "../../adapters/browser/logging-settings.ts";
import { createProjectSettingsEvolveAdapter } from "../../adapters/evolve/progression/research/project-settings.ts";
import { createStorageSettingsEvolveAdapter } from "../../adapters/evolve/economy/storage/storage-settings.ts";
import { createMagicSettingsEvolveAdapter } from "../../adapters/evolve/economy/production/magic-settings.ts";
import { createJobSettingsEvolveAdapter } from "../../adapters/evolve/civic/job-settings.ts";
import { createLoggingSettingsEvolveAdapter } from "../../adapters/evolve/logging-settings.ts";
import type { StorageSettingsIntentHandler } from "../../ports/storage-settings.ts";
import type { ProjectSettingsIntentHandler } from "../../ports/project-settings.ts";
import type { MagicSettingsIntentHandler } from "../../ports/magic-settings.ts";
import type { JobSettingsIntentHandler } from "../../ports/job-settings.ts";

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

type StorageBrowserDependencies = Parameters<
  typeof createStorageSettingsBrowserAdapter
>[0];
type ProjectBrowserDependencies = Parameters<
  typeof createProjectSettingsBrowserAdapter
>[0];
type MagicBrowserDependencies = Parameters<
  typeof createMagicSettingsBrowserAdapter
>[0];
type JobBrowserDependencies = Parameters<
  typeof createJobSettingsBrowserAdapter
>[0];
type WeightingBrowserDependencies = Parameters<
  typeof createWeightingSettingsBrowserAdapter
>[0];
type GeneralBrowserDependencies = Parameters<
  typeof createGeneralSettingsBrowserAdapter
>[0];
type LoggingBrowserDependencies = Parameters<
  typeof createLoggingSettingsBrowserAdapter
>[0];
type RuntimeFunction = (...args: unknown[]) => unknown;

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

function readContextActions<T>(context: unknown, fallback: T): T {
  const record = readRecord(context);
  if (record === undefined) return fallback;
  return record["actions"] === undefined
    ? (context as T)
    : (record["actions"] as T);
}

interface StorageSettingsControlDependencies {
  readonly getDocument: StorageBrowserDependencies["getDocument"];
  readonly getJQuery: StorageBrowserDependencies["getJQuery"];
  readonly actions: StorageSettingsBrowserActions;
  readonly getStorageManager: () => unknown;
  readonly getSettingsRaw: () => unknown;
  readonly resetStorageSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly resetCheckbox: (...keys: string[]) => unknown;
  readonly removeStorageToggles: RuntimeFunction;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createStorageSettingsControl({
  getDocument,
  getJQuery,
  actions,
  getStorageManager,
  getSettingsRaw,
  resetStorageSettings,
  persistSettings,
  resetCheckbox,
  removeStorageToggles,
  testSurface,
}: StorageSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("storageSettings");
  const evolveAdapter = createStorageSettingsEvolveAdapter({
    getStorageManager: () =>
      readContextValue(context(), "StorageManager", getStorageManager()),
    getSettingsRaw: () =>
      readContextValue(context(), "settingsRaw", getSettingsRaw()),
  });
  let intentHandler: StorageSettingsIntentHandler;
  const browserAdapter = createStorageSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    getReadModel: () => evolveAdapter.readStorageSettingsReadModel(),
    intents: {
      handle: (intent) => intentHandler.handle(intent),
    },
    getActions: () => readContextValue(context(), "actions", actions),
  });
  intentHandler = createStorageSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetStorageSettings",
          resetStorageSettings,
        )(true),
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
      reorderResources: (resourceIds) =>
        evolveAdapter.reorderResources(resourceIds),
    },
    renderSettingsContent: () => browserAdapter.updateStorageSettingsContent(),
    effects: {
      resetCheckbox: () =>
        readContextValue(
          context(),
          "resetCheckbox",
          resetCheckbox,
        )("autoStorage"),
      removeStorageToggles: () =>
        readContextValue(
          context(),
          "removeStorageToggles",
          removeStorageToggles,
        )(),
    },
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("storageSettings", {
      storageSettings: browserAdapter,
    });
  return browserAdapter;
}

interface ProjectSettingsControlDependencies {
  readonly getDocument: ProjectBrowserDependencies["getDocument"];
  readonly getJQuery: ProjectBrowserDependencies["getJQuery"];
  readonly actions: ProjectSettingsBrowserActions;
  readonly getProjectManager: () => unknown;
  readonly getSettingsRaw: () => unknown;
  readonly resetProjectSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly resetCheckbox: (...keys: string[]) => unknown;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createProjectSettingsControl({
  getDocument,
  getJQuery,
  actions,
  getProjectManager,
  getSettingsRaw,
  resetProjectSettings,
  persistSettings,
  resetCheckbox,
  testSurface,
}: ProjectSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("projectSettings");
  const evolveAdapter = createProjectSettingsEvolveAdapter({
    getProjectManager: () =>
      readContextValue(context(), "ProjectManager", getProjectManager()),
    getSettingsRaw: () =>
      readContextValue(context(), "settingsRaw", getSettingsRaw()),
  });
  let intentHandler: ProjectSettingsIntentHandler;
  const browserAdapter = createProjectSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    getReadModel: () => evolveAdapter.readProjectSettingsReadModel(),
    intents: {
      handle: (intent) => intentHandler.handle(intent),
    },
    getActions: () => readContextValue(context(), "actions", actions),
  });
  intentHandler = createProjectSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetProjectSettings",
          resetProjectSettings,
        )(true),
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
      reorderProjects: (projectIds) =>
        evolveAdapter.reorderProjects(projectIds),
    },
    renderSettingsContent: () => browserAdapter.updateProjectSettingsContent(),
    effects: {
      resetCheckbox: () =>
        readContextValue(context(), "resetCheckbox", resetCheckbox)("autoARPA"),
    },
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("projectSettings", {
      projectSettings: browserAdapter,
    });
  return browserAdapter;
}

interface MagicSettingsControlDependencies {
  readonly getDocument: MagicBrowserDependencies["getDocument"];
  readonly getJQuery: MagicBrowserDependencies["getJQuery"];
  readonly actions: MagicSettingsBrowserActions;
  readonly getGame: () => unknown;
  readonly getAlchemyManager: () => unknown;
  readonly getRitualManager: () => unknown;
  readonly resetMagicSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly resetCheckbox: (...keys: string[]) => unknown;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createMagicSettingsControl({
  getDocument,
  getJQuery,
  actions,
  getGame,
  getAlchemyManager,
  getRitualManager,
  resetMagicSettings,
  persistSettings,
  resetCheckbox,
  testSurface,
}: MagicSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("magicSettings");
  const evolveAdapter = createMagicSettingsEvolveAdapter({
    getGame: () => readContextValue(context(), "game", getGame()),
    getAlchemyManager: () =>
      readContextValue(context(), "AlchemyManager", getAlchemyManager()),
    getRitualManager: () =>
      readContextValue(context(), "RitualManager", getRitualManager()),
  });
  let intentHandler: MagicSettingsIntentHandler;
  const browserAdapter = createMagicSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    getReadModel: () => evolveAdapter.readMagicSettingsReadModel(),
    intents: {
      handle: (intent) => intentHandler.handle(intent),
    },
    getActions: () => readContextValue(context(), "actions", actions),
  });
  intentHandler = createMagicSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetMagicSettings",
          resetMagicSettings,
        )(true),
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
    },
    renderSettingsContent: () => browserAdapter.updateMagicSettingsContent(),
    effects: {
      resetCheckboxes: () =>
        readContextValue(context(), "resetCheckbox", resetCheckbox)(
          "autoAlchemy",
          "autoPylon",
          "magicFullmetalHelper",
        ),
    },
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("magicSettings", {
      magicSettings: browserAdapter,
    });
  return browserAdapter;
}

interface JobSettingsControlDependencies {
  readonly getDocument: JobBrowserDependencies["getDocument"];
  readonly getJQuery: JobBrowserDependencies["getJQuery"];
  readonly actions: JobSettingsBrowserActions;
  readonly getBasicJob: () => unknown;
  readonly getCraftingJob: () => unknown;
  readonly getJobManager: () => unknown;
  readonly getJobs: () => unknown;
  readonly getSettingsRaw: () => unknown;
  readonly resetJobSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly resetCheckbox: (...keys: string[]) => unknown;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createJobSettingsControl({
  getDocument,
  getJQuery,
  actions,
  getBasicJob,
  getCraftingJob,
  getJobManager,
  getJobs,
  getSettingsRaw,
  resetJobSettings,
  persistSettings,
  resetCheckbox,
  testSurface,
}: JobSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("jobSettings");
  const evolveAdapter = createJobSettingsEvolveAdapter({
    getBasicJob: () => readContextValue(context(), "BasicJob", getBasicJob()),
    getCraftingJob: () =>
      readContextValue(context(), "CraftingJob", getCraftingJob()),
    getJobManager: () =>
      readContextValue(context(), "JobManager", getJobManager()),
    getJobs: () => readContextValue(context(), "jobs", getJobs()),
    getSettingsRaw: () =>
      readContextValue(context(), "settingsRaw", getSettingsRaw()),
  });
  let intentHandler: JobSettingsIntentHandler;
  const browserAdapter = createJobSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    getReadModel: () => evolveAdapter.readJobSettingsReadModel(),
    intents: {
      handle: (intent) => intentHandler.handle(intent),
    },
    getActions: () => readContextValue(context(), "actions", actions),
  });
  intentHandler = createJobSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(context(), "resetJobSettings", resetJobSettings)(true),
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
      resetPriorities: () => evolveAdapter.resetPriorities(),
      reorderJobs: (jobIds) => evolveAdapter.reorderJobs(jobIds),
    },
    renderSettingsContent: () => browserAdapter.updateJobSettingsContent(),
    effects: {
      resetCheckboxes: () =>
        readContextValue(
          context(),
          "resetCheckbox",
          resetCheckbox,
        )("autoJobs", "autoCraftsmen"),
    },
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("jobSettings", {
      jobSettings: browserAdapter,
    });
  return browserAdapter;
}

interface WeightingSettingsControlDependencies {
  readonly getDocument: WeightingBrowserDependencies["getDocument"];
  readonly getJQuery: WeightingBrowserDependencies["getJQuery"];
  readonly actions: WeightingSettingsBrowserActions;
  readonly resetWeightingSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createWeightingSettingsControl({
  getDocument,
  getJQuery,
  actions,
  resetWeightingSettings,
  persistSettings,
  testSurface,
}: WeightingSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("weightingSettings");
  let intentHandler: ReturnType<typeof createWeightingSettingsIntentHandler>;
  const browserAdapter = createWeightingSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    intents: {
      handle: (intent) => intentHandler.handle(intent),
    },
    getActions: () => readContextValue(context(), "actions", actions),
  });
  intentHandler = createWeightingSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetWeightingSettings",
          resetWeightingSettings,
        )(true),
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
    },
    renderSettingsContent: () =>
      browserAdapter.updateWeightingSettingsContent(),
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("weightingSettings", {
      weightingSettings: browserAdapter,
    });
  return browserAdapter;
}

interface GeneralSettingsControlDependencies {
  readonly getDocument: GeneralBrowserDependencies["getDocument"];
  readonly getJQuery: GeneralBrowserDependencies["getJQuery"];
  readonly actions: GeneralSettingsBrowserActions;
  readonly resetGeneralSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly resetCheckbox: (...keys: string[]) => unknown;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createGeneralSettingsControl({
  getDocument,
  getJQuery,
  actions,
  resetGeneralSettings,
  persistSettings,
  resetCheckbox,
  testSurface,
}: GeneralSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("generalSettings");
  let intentHandler: ReturnType<typeof createGeneralSettingsIntentHandler>;
  const browserAdapter = createGeneralSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    intents: {
      handle: (intent) => intentHandler.handle(intent),
    },
    getActions: () => readContextActions(context(), actions),
  });
  intentHandler = createGeneralSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetGeneralSettings",
          resetGeneralSettings,
        )(true),
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
    },
    renderSettingsContent: () => browserAdapter.updateGeneralSettingsContent(),
    effects: {
      resetCheckboxes: () =>
        readContextValue(context(), "resetCheckbox", resetCheckbox)(
          "masterScriptToggle",
          "showSettings",
          "autoPrestige",
        ),
    },
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("generalSettings", {
      generalSettings: browserAdapter,
    });
  return browserAdapter;
}

interface LoggingSettingsControlDependencies {
  readonly getDocument: LoggingBrowserDependencies["getDocument"];
  readonly getJQuery: LoggingBrowserDependencies["getJQuery"];
  readonly actions: LoggingSettingsBrowserActions;
  readonly getGame: () => unknown;
  readonly getGameLog: () => unknown;
  readonly getSettingsRaw: () => unknown;
  readonly resetLoggingSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly buildFilterRegExp: RuntimeFunction;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createLoggingSettingsControl({
  getDocument,
  getJQuery,
  actions,
  getGame,
  getGameLog,
  getSettingsRaw,
  resetLoggingSettings,
  persistSettings,
  buildFilterRegExp,
  testSurface,
}: LoggingSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("loggingSettings");
  const evolveAdapter = createLoggingSettingsEvolveAdapter({
    getGame: () => readContextValue(context(), "game", getGame()),
    getGameLog: () => readContextValue(context(), "GameLog", getGameLog()),
    getSettingsRaw: () =>
      readContextValue(context(), "settingsRaw", getSettingsRaw()),
  });
  let intentHandler: ReturnType<typeof createLoggingSettingsIntentHandler>;
  const browserAdapter = createLoggingSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    getReadModel: () => evolveAdapter.readLoggingSettingsReadModel(),
    intents: {
      handle: (intent) => intentHandler.handle(intent),
    },
    getActions: () => readContextValue(context(), "actions", actions),
  });
  intentHandler = createLoggingSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetLoggingSettings",
          resetLoggingSettings,
        )(true),
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
      setLogFilter: (value) => {
        const target = readRecord(
          readContextValue(context(), "settingsRaw", getSettingsRaw()),
        );
        if (target === undefined)
          throw new TypeError("settingsRaw must be an object");
        target["logFilter"] = value;
      },
    },
    renderSettingsContent: (secondaryPrefix) =>
      browserAdapter.updateLoggingSettingsContent(secondaryPrefix),
    effects: {
      buildFilterRegExp: () =>
        readContextValue(context(), "buildFilterRegExp", buildFilterRegExp)(),
    },
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("loggingSettings", {
      loggingSettings: browserAdapter,
    });
  return browserAdapter;
}
