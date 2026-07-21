import type { SettingsStore } from "../../ports/settings-store.ts";

const SETTINGS_KEY = "settings";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createSettingsStore(storage: KeyValueStorage): SettingsStore {
  return Object.freeze({
    load(): unknown {
      // Legacy read: JSON.parse(localStorage.getItem("settings")) ?? {}.
      // An absent key coerces to the JSON literal "null" (parses to null, then
      // the ?? falls back to {}); corrupt stored JSON throws exactly as legacy
      // did — the boundary stays unprotected on purpose.
      return JSON.parse(storage.getItem(SETTINGS_KEY) ?? "null") ?? {};
    },
    save(record: unknown): void {
      storage.setItem(SETTINGS_KEY, JSON.stringify(record));
    },
  });
}
