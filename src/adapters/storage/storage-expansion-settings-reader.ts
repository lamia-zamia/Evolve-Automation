import type { StorageExpansionSettings } from "../../domain/storage-expansion.ts";
import type { SettingsReader } from "../../ports/settings-reader.ts";
import { requireBoolean, requireRecord } from "../validation.ts";

export function createStorageExpansionSettingsReader(
  getSettings: () => unknown,
): SettingsReader<StorageExpansionSettings> {
  function readSettings(): Readonly<StorageExpansionSettings> {
    const settings = requireRecord(getSettings(), "settings");
    return Object.freeze({
      storageLimitPreMad: requireBoolean(
        settings["storageLimitPreMad"],
        "settings.storageLimitPreMad",
      ),
    });
  }

  return Object.freeze({ readSettings });
}
