interface SettingOverride extends Record<string, unknown> {
  ret: unknown;
}

interface SettingsRecord extends Record<string, unknown> {
  overrides: Record<string, SettingOverride[]>;
  triggers: unknown[];
}

interface TriggerManagerContract {
  priorityList: unknown[];
  AddTriggerFromSetting(trigger: unknown): void;
}

interface StorageContract {
  setItem(key: string, value: string): void;
}

interface SettingsStateDependencies {
  getSettingsRaw: () => SettingsRecord;
  getTriggerManager: () => TriggerManagerContract;
  storage: StorageContract;
}

export function createSettingsState({
  getSettingsRaw,
  getTriggerManager,
  storage,
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
    storage.setItem("settings", JSON.stringify(settingsRaw));
  }

  function applySettings(def: Record<string, unknown>, reset: boolean) {
    const settingsRaw = getSettingsRaw();
    if (reset) {
      for (const key in def) {
        delete settingsRaw.overrides[key];
      }
      Object.assign(settingsRaw, def);
    } else {
      for (const key in def) {
        if (!Object.prototype.hasOwnProperty.call(settingsRaw, key)) {
          settingsRaw[key] = def[key];
        } else {
          if (
            typeof settingsRaw[key] === "string" &&
            typeof def[key] === "number"
          ) {
            settingsRaw[key] = Number(settingsRaw[key]);
          }
          if (
            typeof settingsRaw[key] === "number" &&
            typeof def[key] === "string"
          ) {
            settingsRaw[key] = String(settingsRaw[key]);
          }
        }
      }
    }
  }

  function migrateSetting(
    oldSetting: string,
    newSetting: string,
    mapCb: (value: unknown) => unknown,
    keepOldValue?: boolean,
  ) {
    const settingsRaw = getSettingsRaw();
    if (Object.prototype.hasOwnProperty.call(settingsRaw, oldSetting)) {
      if (!keepOldValue) {
        settingsRaw[newSetting] = mapCb(settingsRaw[oldSetting]);
      }
      delete settingsRaw[oldSetting];
    }
    if (
      Object.prototype.hasOwnProperty.call(settingsRaw.overrides, oldSetting)
    ) {
      settingsRaw.overrides[oldSetting].forEach(
        (override) => (override.ret = mapCb(override.ret)),
      );
      settingsRaw.overrides[newSetting] = (
        settingsRaw.overrides[newSetting] ?? []
      ).concat(settingsRaw.overrides[oldSetting]);
      delete settingsRaw.overrides[oldSetting];
    }
  }

  return {
    updateStateFromSettings,
    updateSettingsFromState,
    applySettings,
    migrateSetting,
  };
}
