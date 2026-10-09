import { resolveOverrides } from "../domain/override-resolution.ts";
import { layerSettingsOver } from "../domain/settings-layer.ts";
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
  let lastResolved: Readonly<Record<string, unknown>> | undefined;
  const publishResolution = (resolution: Readonly<Record<string, unknown>>) => {
    const changed =
      lastResolved === undefined
        ? Object.keys(resolution).length > 0
        : Object.keys(lastResolved).length !== Object.keys(resolution).length ||
          Object.entries(resolution).some(([key, value]) => {
            const previous = lastResolved?.[key];
            return Array.isArray(value) && Array.isArray(previous)
              ? value.length !== previous.length ||
                  value.some(
                    (entry, index) => !Object.is(entry, previous[index]),
                  )
              : !Object.is(value, previous);
          });
    lastResolved = Object.freeze({ ...resolution });
    return changed;
  };

  function updateOverrides(): boolean {
    const settings = getSettings();
    const settingsRaw = getSettingsRaw();

    layerSettingsOver(settings, settingsRaw);

    // Safe mode doesn't update overrides and always disables script toggle
    if (getSafeMode()) {
      settings.masterScriptToggle = false;
      return publishResolution({});
    }

    const resolution = resolveOverrides({
      settingsRaw,
      evaluator: source.sampleEvaluator(),
      activeTasks: source.readForcedTasks(),
    });

    Object.assign(settings, resolution.values);
    for (const [key, list] of Object.entries(resolution.lists)) {
      settings[key] = list;
    }

    reporter.report(resolution.failures);
    display.publish();
    return publishResolution({ ...resolution.values, ...resolution.lists });
  }

  function syncStoredSettings(): boolean {
    layerSettingsOver(getSettings(), getSettingsRaw());
    return publishResolution({});
  }

  return { updateOverrides, syncStoredSettings };
}
