import {
  applyOverrideEdit,
  type OverrideEdit,
} from "../domain/override-editing.ts";
import type { SettingsRecord } from "../domain/settings-migration.ts";
import type {
  OverrideEditor,
  OverrideEditOutcome,
} from "../ports/override-editing.ts";
import type { SettingsPersistence } from "../ports/settings-persistence.ts";

export interface OverrideEditorDependencies {
  getSettingsRaw: () => SettingsRecord;
  persistence: SettingsPersistence;
}

export function createOverrideEditor({
  getSettingsRaw,
  persistence,
}: OverrideEditorDependencies): OverrideEditor {
  return {
    applyEdit(edit: OverrideEdit): OverrideEditOutcome {
      const settingsRaw = getSettingsRaw();
      const result = applyOverrideEdit(settingsRaw.overrides, edit);
      if (result.applied) {
        settingsRaw.overrides = result.overrides;
        persistence.save();
      }
      return { conditionCount: result.conditionCount };
    },

    setSettingValue(settingKey: string, value: unknown): void {
      getSettingsRaw()[settingKey] = value;
      persistence.save();
    },
  };
}
