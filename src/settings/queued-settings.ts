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
      const queuedEvolution = settingsRaw.evolutionQueue.shift()!;
      for (const [settingName, settingValue] of Object.entries(
        queuedEvolution,
      )) {
        if (typeof settingsRaw[settingName] === typeof settingValue) {
          settingsRaw[settingName] = settingValue;
        } else {
          getGameLog().logDanger(
            "special",
            `Type mismatch during loading queued settings: settingsRaw.${settingName} type: ${typeof settingsRaw[
              settingName
            ]}, value: ${
              settingsRaw[settingName]
            }; queuedEvolution.${settingName} type: ${typeof settingValue}, value: ${settingValue};`,
            ["events", "major_events"],
          );
        }
      }
      getUpdateOverrides()();
      if (settings.evolutionQueueRepeat) {
        settingsRaw.evolutionQueue.push(queuedEvolution);
      }
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
