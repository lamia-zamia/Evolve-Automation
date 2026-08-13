import { createTriggerSettingsIntentHandler } from "../../application/trigger-settings.ts";
import {
  createTriggerSettingsBrowserAdapter,
  type TriggerSettingsBrowserActions,
} from "../../adapters/browser/trigger-settings.ts";
import { createTriggerSettingsEvolveAdapter } from "../../adapters/evolve/progression/build/trigger-settings.ts";

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
  typeof createTriggerSettingsBrowserAdapter
>[0];
interface TriggerRecord {
  [key: string]: unknown;
  complete?: boolean;
  priority?: number;
}
interface TriggerManager {
  AddTrigger(...args: unknown[]): unknown;
  getTrigger(seq: number): TriggerRecord | undefined;
  RemoveTrigger(seq: number): unknown;
  DuplicateTrigger(seq: number): unknown;
  EvalizeTrigger(seq: number): unknown;
  sortByPriority(): unknown;
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

interface TriggerSettingsControlDependencies {
  readonly getDocument: BrowserDependencies["getDocument"];
  readonly getJQuery: BrowserDependencies["getJQuery"];
  readonly actions: TriggerSettingsBrowserActions;
  readonly getTriggerManager: () => unknown;
  readonly getCheckTypes: () => unknown;
  readonly getActionInputs: () => unknown;
  readonly getBooleanResultChecks: () => unknown;
  readonly getOverrideOnlyChecks: () => unknown;
  readonly resetTriggerSettings: RuntimeFunction;
  readonly persistSettings: RuntimeFunction;
  readonly resetCheckbox: (...keys: string[]) => unknown;
  readonly testSurface: RuntimeTestSurface | undefined;
}

export function createTriggerSettingsControl({
  getDocument,
  getJQuery,
  actions,
  getTriggerManager,
  getCheckTypes,
  getActionInputs,
  getBooleanResultChecks,
  getOverrideOnlyChecks,
  resetTriggerSettings,
  persistSettings,
  resetCheckbox,
  testSurface,
}: TriggerSettingsControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("triggerSettings");
  const reader = createTriggerSettingsEvolveAdapter({
    getTriggerManager: () =>
      readContextValue(context(), "TriggerManager", getTriggerManager()),
    getCheckTypes: () =>
      readContextValue(context(), "checkTypes", getCheckTypes()),
    getActionInputs: () =>
      readContextValue(context(), "argType", getActionInputs()),
    getBooleanResultChecks: () =>
      readContextValue(context(), "retBools", getBooleanResultChecks()),
    getOverrideOnlyChecks: () =>
      readContextValue(
        context(),
        "overrideOnlyChecks",
        getOverrideOnlyChecks(),
      ),
  });
  let intentHandler: ReturnType<typeof createTriggerSettingsIntentHandler>;
  const browserAdapter = createTriggerSettingsBrowserAdapter({
    getDocument,
    getJQuery,
    reader,
    intents: {
      handle: (intent) => intentHandler.handle(intent),
    },
    getActions: () => readContextActions(context(), actions),
  });
  intentHandler = createTriggerSettingsIntentHandler({
    writer: {
      resetToDefaults: () =>
        readContextValue(
          context(),
          "resetTriggerSettings",
          resetTriggerSettings,
        )(true),
      addDefault: () => {
        const manager = readContextValue<TriggerManager>(
          context(),
          "TriggerManager",
          getTriggerManager() as TriggerManager,
        );
        manager.AddTrigger("Boolean", false, 1, "research", "tech-club", 0);
      },
      update: (seq, field, value) => {
        const manager = readContextValue<TriggerManager>(
          context(),
          "TriggerManager",
          getTriggerManager() as TriggerManager,
        );
        const trigger = manager.getTrigger(seq);
        if (!trigger) return;
        trigger[field] = value;
        trigger.complete = false;
        if (field === "requirementType") {
          trigger.requirementId = false;
          trigger.requirementCount = 1;
        }
        if (field === "actionType") {
          trigger.actionId = "";
          trigger.actionCount = 0;
        }
      },
      remove: (seq) =>
        readContextValue<TriggerManager>(
          context(),
          "TriggerManager",
          getTriggerManager() as TriggerManager,
        ).RemoveTrigger(seq),
      duplicate: (seq) =>
        readContextValue<TriggerManager>(
          context(),
          "TriggerManager",
          getTriggerManager() as TriggerManager,
        ).DuplicateTrigger(seq),
      evalize: (seq) =>
        readContextValue<TriggerManager>(
          context(),
          "TriggerManager",
          getTriggerManager() as TriggerManager,
        ).EvalizeTrigger(seq),
      reorder: (seqs) => {
        const manager = readContextValue<TriggerManager>(
          context(),
          "TriggerManager",
          getTriggerManager() as TriggerManager,
        );
        seqs.forEach((seq, index) => {
          const trigger = manager.getTrigger(seq);
          if (trigger) trigger.priority = index;
        });
        manager.sortByPriority();
      },
      persist: () =>
        readContextValue(
          context(),
          "updateSettingsFromState",
          persistSettings,
        )(),
    },
    render: () => browserAdapter.updateTriggerSettingsContent(),
    effects: {
      resetCheckbox: () =>
        readContextValue(
          context(),
          "resetCheckbox",
          resetCheckbox,
        )("autoTrigger"),
    },
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.addContext("triggerSettings", {
      triggerSettings: browserAdapter,
    });
  return browserAdapter;
}
