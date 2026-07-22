import type {
  MechSettingsIntent,
  MechSettingsReadModel,
} from "../domain/mech-settings.ts";
export interface MechSettingsReader {
  read(): MechSettingsReadModel;
}
export interface MechSettingsIntentHandler {
  handle(intent: MechSettingsIntent): void;
}
export interface MechSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
}
export interface MechSettingsEffects {
  resetCheckboxes(): void;
  removeMechInfo(): void;
}
