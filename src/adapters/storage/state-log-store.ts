import type { StateLogStore } from "../../ports/state-log-store.ts";

const STATE_LOG_KEY = "ea_state_log";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createStateLogStore(storage: KeyValueStorage): StateLogStore {
  return Object.freeze({
    load(): unknown {
      // Legacy read: JSON.parse(localStorage.getItem("ea_state_log")). An absent
      // key coerces to the JSON literal "null" (parses to null); corrupt stored
      // JSON throws exactly as the legacy inline parse did — the caller wraps this
      // in a try/catch and turns the throw into a fresh log.
      return JSON.parse(storage.getItem(STATE_LOG_KEY) ?? "null");
    },
    save(record: unknown): void {
      storage.setItem(STATE_LOG_KEY, JSON.stringify(record));
    },
  });
}
