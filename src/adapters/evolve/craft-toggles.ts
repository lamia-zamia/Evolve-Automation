import { requireRecord } from "../validation.ts";
import type { CraftToggleItem } from "../../domain/craft-toggles.ts";
import type { CraftToggleReader } from "../../ports/craft-toggles.ts";

export interface CraftToggleEvolveDependencies {
  readonly getCraftablesList: () => unknown;
  readonly getSettingsRaw: () => unknown;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

/** Evolve adapter for the ordered craftables catalog and its persisted toggles. */
export function createCraftToggleEvolveAdapter({
  getCraftablesList,
  getSettingsRaw,
}: CraftToggleEvolveDependencies): CraftToggleReader {
  return Object.freeze({
    readItems(): readonly CraftToggleItem[] {
      const rawCraftables = getCraftablesList();
      if (!Array.isArray(rawCraftables)) {
        throw new TypeError("craftablesList must be an array");
      }
      const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");

      return Object.freeze(
        rawCraftables.map((rawCraftable, index) => {
          const craftable = requireRecord(
            rawCraftable,
            `craftablesList[${index}]`,
          );
          const craftableId = requireString(
            craftable["id"],
            `craftablesList[${index}].id`,
          );
          const settingKey = `craft${craftableId}`;
          return Object.freeze({
            craftableId,
            settingKey,
            // Evolve leaves per-craftable toggles absent until first written; legacy treated absence as disabled.
            enabled: Boolean(settingsRaw[settingKey]),
          });
        }),
      );
    },
  });
}
