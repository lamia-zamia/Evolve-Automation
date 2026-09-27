import type { StateLogStore } from "../../ports/state-log-store.ts";
import { readProperty } from "../validation.ts";

const STATE_LOG_KEY = "ea_state_log";

export function createStateLogStore(storage: unknown): StateLogStore {
  return Object.freeze({
    load(): unknown {
      // Legacy read: JSON.parse(localStorage.getItem("ea_state_log")). An absent
      // key coerces to the JSON literal "null" (parses to null); corrupt stored
      // JSON throws exactly as the legacy inline parse did — the caller wraps this
      // in a try/catch and turns the throw into a fresh log.
      const getItem = readProperty(storage, "getItem");
      if (typeof getItem !== "function") return null;
      const serialized: unknown = Reflect.apply(getItem, storage, [
        STATE_LOG_KEY,
      ]);
      return JSON.parse(typeof serialized === "string" ? serialized : "null");
    },
    save(record: unknown): void {
      const setItem = readProperty(storage, "setItem");
      if (typeof setItem !== "function") return;
      Reflect.apply(setItem, storage, [STATE_LOG_KEY, JSON.stringify(record)]);
    },
  });
}
