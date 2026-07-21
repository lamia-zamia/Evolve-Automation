import type { OptionsToggleState } from "../domain/options-modal.ts";

/** Reads the effective state used to render a generic automation toggle. */
export interface OptionsModalSettingsReader {
  readToggle(settingName: string): OptionsToggleState;
}

/** Writes and persists a generic boolean automation setting. */
export interface OptionsModalSettingsWriter {
  setToggle(settingName: string, checked: boolean): void;
  persist(): void;
}
