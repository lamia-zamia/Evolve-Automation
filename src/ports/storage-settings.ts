import type { StorageSettingsIntent } from "../domain/storage-settings.ts";

/** Receives user intents emitted by the Storage settings UI. */
export interface StorageSettingsIntentHandler {
  handle(intent: StorageSettingsIntent): void;
}

/** Writes Storage settings and preserves the legacy reorder sequence. */
export interface StorageSettingsWriter {
  resetToDefaults(): void;
  persist(): void;
  reorderResources(resourceIds: readonly string[]): void;
}

export interface StorageSettingsEffects {
  resetCheckbox(): void;
  removeStorageToggles(): void;
}
