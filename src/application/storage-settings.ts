import type { StorageSettingsIntent } from "../domain/storage-settings.ts";
import type {
  StorageSettingsEffects,
  StorageSettingsIntentHandler,
  StorageSettingsWriter,
} from "../ports/storage-settings.ts";

interface StorageSettingsIntentDependencies {
  readonly writer: StorageSettingsWriter;
  readonly renderSettingsContent: () => void;
  readonly effects: StorageSettingsEffects;
}

/** Owns Storage reset and reorder sequencing outside the browser adapter. */
export function createStorageSettingsIntentHandler({
  writer,
  renderSettingsContent,
  effects,
}: StorageSettingsIntentDependencies): StorageSettingsIntentHandler {
  return Object.freeze({
    handle(intent: StorageSettingsIntent): void {
      switch (intent.type) {
        case "reset-storage-settings":
          writer.resetToDefaults();
          writer.persist();
          renderSettingsContent();
          effects.resetCheckbox();
          effects.removeStorageToggles();
          return;
        case "reorder-storage-resources":
          writer.reorderResources(intent.resourceIds);
          writer.persist();
          return;
      }
    },
  });
}
