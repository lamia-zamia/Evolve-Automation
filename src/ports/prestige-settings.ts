import type {
  PrestigeSettingsIntent,
  PrestigeSettingsReadModel,
} from "../domain/progression/prestige/prestige-settings.ts";

export interface PrestigeSettingsReader {
  read(): PrestigeSettingsReadModel;
  getConfirmationText(value: string): string;
}
export interface PrestigeSettingsIntentHandler {
  handle(intent: PrestigeSettingsIntent): void;
}
export interface PrestigeSettingsWriter {
  resetToDefaults(): void;
  setPrestigeType(value: string): void;
  setGoalStandard(): void;
  persist(): void;
}
export interface PrestigeSettingsEffects {
  confirm(message: string): boolean;
}
