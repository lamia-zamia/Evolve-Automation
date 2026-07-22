import type {
  EvolutionSettingsIntent,
  EvolutionSettingsReadModel,
} from "../domain/evolution-settings.ts";
export interface EvolutionSettingsReader {
  read(): EvolutionSettingsReadModel;
}
export interface EvolutionSettingsIntentHandler {
  handle(intent: EvolutionSettingsIntent): void;
}
export interface EvolutionSettingsWriter {
  resetToDefaults(): void;
  setTarget(value: string): void;
  addCurrent(prestigeType: string): void;
  remove(index: number): void;
  edit(index: number, json: string): void;
  reorder(indexes: readonly number[]): void;
  persist(): void;
}
export interface EvolutionSettingsEffects {
  resetCheckbox(): void;
}
