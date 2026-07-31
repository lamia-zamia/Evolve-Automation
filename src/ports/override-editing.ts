import type { OverrideEdit } from "../domain/override-editing.ts";

export interface OverrideEditOutcome {
  /** Conditions the edited setting has afterwards, which is what the editor's row marker shows. */
  readonly conditionCount: number;
}

/** The one way the override editor changes stored settings. */
export interface OverrideEditor {
  applyEdit(edit: OverrideEdit): OverrideEditOutcome;
  /** Writes the setting's own value, which the editor offers beside its conditions. */
  setSettingValue(settingKey: string, value: unknown): void;
}
