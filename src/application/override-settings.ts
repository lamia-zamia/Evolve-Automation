import { resolveOverrides } from "../domain/override-resolution.ts";
import type {
  OverrideEffectiveValueDisplay,
  OverrideEvaluationSource,
  OverrideFailureReporter,
} from "../ports/override-settings.ts";

export interface OverrideSettingsDependencies {
  getSafeMode: () => boolean;
  /** The effective settings the rest of the tick reads. */
  getSettings: () => Record<string, unknown>;
  /** The stored settings the player edits. Never written by this handler. */
  getSettingsRaw: () => Record<string, unknown>;
  source: OverrideEvaluationSource;
  reporter: OverrideFailureReporter;
  display: OverrideEffectiveValueDisplay;
}

export function createOverrideSettings({
  getSafeMode,
  getSettings,
  getSettingsRaw,
  source,
  reporter,
  display,
}: OverrideSettingsDependencies) {
  function updateOverrides(): void {
    const settings = getSettings();
    const settingsRaw = getSettingsRaw();

    // Safe mode doesn't update overrides and always disables script toggle
    if (getSafeMode()) {
      Object.assign(settings, settingsRaw);
      settings.masterScriptToggle = false;
      return;
    }

    const resolution = resolveOverrides({
      settingsRaw,
      evaluator: source.sampleEvaluator(),
      activeTasks: source.readForcedTasks(),
    });

    Object.assign(settings, settingsRaw, resolution.values);
    for (const [key, list] of Object.entries(resolution.lists)) {
      settings[key] = list;
    }

    reporter.report(resolution.failures);
    display.publish();
  }

  return { updateOverrides };
}
