/**
 * The script's own settings, as one writable record backed by `localStorage.settings`.
 *
 * This is the single owner of that record. The settings UI mutates settings in place and then asks
 * for them to be persisted, which is the shape every control in `src/ui/` and
 * `src/adapters/browser/` already expects; the runtime reads its automation toggles from the same
 * object, so a toggle takes effect on the next tick without a reload.
 *
 * The blob is parsed once rather than on every read. A real settings file is several thousand keys
 * and the previous per-read `JSON.parse` ran many times per tick. The trade-off is that an external
 * edit to `localStorage.settings` is no longer picked up mid-session — only on reload — which is the
 * correct direction now that the panel is the thing doing the writing.
 */

import { isNonArrayRecord, readProperty } from "../validation.ts";

export interface SettingsStore {
  /** The live record. Mutating it is how the settings UI writes; then call `persist`. */
  readRaw(): Record<string, unknown>;
  /**
   * Replaces the whole record, which is what a settings import is. Every reader goes through
   * `readRaw` on each use, so the next read — automation's included — sees the imported record.
   */
  replaceRaw(next: Record<string, unknown>): void;
  /** Writes the record back to storage. A storage failure is reported, never thrown. */
  persist(): void;
}

export interface SettingsStoreDependencies {
  readonly storage: unknown;
  /** Reported with the reason when reading or writing the blob fails. */
  readonly logError?: (message: string) => void;
}

function readSettingsText(storage: unknown): string | undefined {
  const getItem = readProperty(storage, "getItem");
  if (typeof getItem !== "function") return undefined;
  const raw: unknown = Reflect.apply(getItem, storage, ["settings"]);
  return typeof raw === "string" ? raw : undefined;
}

export function createSettingsStore({
  storage,
  logError = () => {},
}: SettingsStoreDependencies): SettingsStore {
  let record: Record<string, unknown> | undefined;
  const load = (): Record<string, unknown> => {
    const text = readSettingsText(storage);
    if (text === undefined) return {};
    try {
      const parsed: unknown = JSON.parse(text);
      // A settings blob is always an object; an array or a bare value is corruption, and starting
      // from empty is better than letting every `settings[key]` read answer from the wrong shape.
      return isNonArrayRecord(parsed) ? parsed : {};
    } catch (error) {
      logError(
        `settings could not be parsed, starting empty: ${String(error)}`,
      );
      return {};
    }
  };
  return Object.freeze({
    readRaw() {
      record ??= load();
      return record;
    },
    replaceRaw(next: Record<string, unknown>) {
      record = next;
    },
    persist() {
      const setItem = readProperty(storage, "setItem");
      if (typeof setItem !== "function") return;
      try {
        Reflect.apply(setItem, storage, [
          "settings",
          JSON.stringify(record ?? {}),
        ]);
      } catch (error) {
        logError(`settings could not be saved: ${String(error)}`);
      }
    },
  });
}
