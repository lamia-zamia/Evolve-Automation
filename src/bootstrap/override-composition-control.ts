import { createOverrideEffectiveValueDisplay } from "../adapters/browser/override-display.ts";
import { createOverrideEvaluationSource } from "../adapters/evolve/override-evaluation.ts";
import { createOverrideFailureReporter } from "../adapters/evolve/override-failure-log.ts";
import { createOverrideSettings } from "../application/override-settings.ts";

type OverrideSettingsDependencies = Parameters<
  typeof createOverrideSettings
>[0];
type EvaluationDependencies = Parameters<
  typeof createOverrideEvaluationSource
>[0];
type ReporterDependencies = Parameters<typeof createOverrideFailureReporter>[0];
type DisplayDependencies = Parameters<
  typeof createOverrideEffectiveValueDisplay
>[0];

export interface OverrideCompositionControlDependencies {
  readonly getSafeMode: OverrideSettingsDependencies["getSafeMode"];
  readonly getSettings: OverrideSettingsDependencies["getSettings"];
  readonly getSettingsRaw: OverrideSettingsDependencies["getSettingsRaw"];
  readonly getCheckTypes: EvaluationDependencies["getCheckTypes"];
  readonly getCheckCompare: EvaluationDependencies["getCheckCompare"];
  readonly getCheckCustom: EvaluationDependencies["getCheckCustom"];
  readonly getHaveTask: EvaluationDependencies["getHaveTask"];
  readonly getGameModal: ReporterDependencies["getGameModal"];
  readonly getGame: ReporterDependencies["getGame"];
  readonly getGameLog: ReporterDependencies["getGameLog"];
  readonly getJQuery: DisplayDependencies["getJQuery"];
  readonly changeDisplayInputNode: DisplayDependencies["changeDisplayInputNode"];
}

export function createOverrideCompositionControl({
  getSafeMode,
  getSettings,
  getSettingsRaw,
  getCheckTypes,
  getCheckCompare,
  getCheckCustom,
  getHaveTask,
  getGameModal,
  getGame,
  getGameLog,
  getJQuery,
  changeDisplayInputNode,
}: OverrideCompositionControlDependencies) {
  return createOverrideSettings({
    getSafeMode,
    getSettings,
    getSettingsRaw,
    source: createOverrideEvaluationSource({
      getCheckTypes,
      getCheckCompare,
      getCheckCustom,
      getHaveTask,
    }),
    reporter: createOverrideFailureReporter({
      getGameModal,
      getGame,
      getGameLog,
    }),
    display: createOverrideEffectiveValueDisplay({
      getJQuery,
      changeDisplayInputNode,
    }),
  });
}
