interface SettingsRecord extends Record<string, unknown> {
  triggers: unknown[];
}

interface TriggerManagerContract {
  priorityList: unknown[];
  AddTriggerFromSetting(trigger: unknown): void;
}

interface SettingsStoreContract {
  save(record: unknown): void;
}

interface SettingsStateDependencies {
  getSettingsRaw: () => SettingsRecord;
  getTriggerManager: () => TriggerManagerContract;
  settingsStore: SettingsStoreContract;
}

export function createSettingsState({
  getSettingsRaw,
  getTriggerManager,
  settingsStore,
}: SettingsStateDependencies) {
  function updateStateFromSettings() {
    const settingsRaw = getSettingsRaw();
    const TriggerManager = getTriggerManager();
    TriggerManager.priorityList = [];
    settingsRaw.triggers.forEach((trigger) =>
      TriggerManager.AddTriggerFromSetting(trigger),
    );
  }

  function updateSettingsFromState() {
    const settingsRaw = getSettingsRaw();
    settingsRaw.triggers = JSON.parse(
      JSON.stringify(getTriggerManager().priorityList),
    );
    settingsStore.save(settingsRaw);
  }

  return {
    updateStateFromSettings,
    updateSettingsFromState,
  };
}
