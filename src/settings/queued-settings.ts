import { applyQueuedSettings } from "../utils/queued-settings.ts";

interface QueuedSettingsConfiguration {
  evolutionQueueEnabled: boolean;
  evolutionQueueRepeat: boolean;
  showSettings: boolean;
}

interface RawQueuedSettings extends Record<string, unknown> {
  evolutionQueue: Record<string, unknown>[];
}

interface QueuedSettingsDependencies {
  getSettings: () => QueuedSettingsConfiguration;
  getSettingsRaw: () => RawQueuedSettings;
  getState: () => { evolutionAttempts: number };
  getGameLog: () => {
    logDanger(type: string, message: string, tags: string[]): void;
  };
  getUpdateOverrides: () => () => void;
  getUpdateStandAloneSettings: () => () => void;
  getUpdateStateFromSettings: () => () => void;
  getUpdateSettingsFromState: () => () => void;
  getRemoveScriptSettings: () => () => void;
  getBuildScriptSettings: () => () => void;
}

export function createQueuedSettings({
  getSettings,
  getSettingsRaw,
  getState,
  getGameLog,
  getUpdateOverrides,
  getUpdateStandAloneSettings,
  getUpdateStateFromSettings,
  getUpdateSettingsFromState,
  getRemoveScriptSettings,
  getBuildScriptSettings,
}: QueuedSettingsDependencies) {
  function loadQueuedSettings() {
    const settings = getSettings();
    const settingsRaw = getSettingsRaw();
    if (
      settings.evolutionQueueEnabled &&
      settingsRaw.evolutionQueue.length > 0
    ) {
      getState().evolutionAttempts++;
      const applied = applyQueuedSettings({
        enabled: settings.evolutionQueueEnabled,
        repeat: settings.evolutionQueueRepeat,
        settingsRaw,
        evolutionQueue: settingsRaw.evolutionQueue,
        onTypeMismatch: (settingName, currentValue, queuedValue) => {
          getGameLog().logDanger(
            "special",
            `Type mismatch during loading queued settings: settingsRaw.${settingName} type: ${typeof currentValue}, value: ${currentValue}; queuedEvolution.${settingName} type: ${typeof queuedValue}, value: ${queuedValue};`,
            ["events", "major_events"],
          );
        },
      });
      if (!applied) return;
      getUpdateOverrides()();
      getUpdateStandAloneSettings()();
      getUpdateStateFromSettings()();
      getUpdateSettingsFromState()();
      if (settings.showSettings) {
        getRemoveScriptSettings()();
        getBuildScriptSettings()();
      }
    }
  }

  return { loadQueuedSettings };
}
