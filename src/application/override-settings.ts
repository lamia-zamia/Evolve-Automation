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

/**
 * Re-bases the effective settings on the stored ones and drops the previous
 * pass's decisions, leaving an object whose own properties are exactly what
 * this pass is about to decide and whose every other key resolves to the
 * stored setting.
 *
 * The alternative — copying the stored settings key by key — costs about
 * 0.8 ms of every tick on a late-game save, because there are roughly 3 700 of
 * them and only a handful are ever overridden. Reading a key through the
 * prototype instead costs about 6 ns more than reading an own property.
 *
 * `settingsRaw` is replaced outright by an import or a settings reset, so the
 * prototype is re-pointed whenever it no longer matches.
 */
function rebaseOnStoredSettings(
  settings: Record<string, unknown>,
  settingsRaw: Record<string, unknown>,
): void {
  // A caller that hands us the stored object itself has nothing to layer over,
  // and linking an object to itself would throw.
  if (settings === settingsRaw) return;
  if (Object.getPrototypeOf(settings) !== settingsRaw) {
    Object.setPrototypeOf(settings, settingsRaw);
  }
  for (const key of Object.keys(settings)) {
    delete settings[key];
  }
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

    rebaseOnStoredSettings(settings, settingsRaw);

    // Safe mode doesn't update overrides and always disables script toggle
    if (getSafeMode()) {
      settings.masterScriptToggle = false;
      return;
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
  }

  return { updateOverrides };
}
