import type { TriggerSettingsIntent } from "../domain/trigger-settings.ts";

export interface TriggerSettingsReader {
  read(): import("../domain/trigger-settings.ts").TriggerSettingsReadModel;
}

export interface TriggerSettingsIntentHandler {
  handle(intent: TriggerSettingsIntent): void;
}

export interface TriggerSettingsWriter {
  resetToDefaults(): void;
  addDefault(): void;
  update(
    seq: number,
    field: Extract<TriggerSettingsIntent, { type: "update-trigger" }>["field"],
    value: import("../domain/trigger-settings.ts").TriggerValue,
  ): void;
  remove(seq: number): void;
  duplicate(seq: number): void;
  evalize(seq: number): void;
  reorder(seqs: readonly number[]): void;
  persist(): void;
}

export interface TriggerSettingsEffects {
  resetCheckbox(): void;
}
