import { requireRecord } from "../validation.ts";
import type { PrestigeTopBarTypeOption } from "../../domain/progression/prestige/prestige-top-bar.ts";
import type { PrestigeTopBarReader } from "../../ports/prestige-top-bar.ts";

export interface PrestigeTopBarEvolveDependencies {
  readonly getSettings: () => unknown;
  readonly getPrestigeTypes: () => unknown;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

/** Evolve adapter for the top-bar setting, selected value, and prestige catalog. */
export function createPrestigeTopBarEvolveAdapter({
  getSettings,
  getPrestigeTypes,
}: PrestigeTopBarEvolveDependencies): PrestigeTopBarReader {
  return Object.freeze({
    readDisplayEnabled(): boolean {
      const settings = requireRecord(getSettings(), "settings");
      // This setting is absent while Evolve is still initializing; legacy code treated that as disabled.
      return Boolean(settings["displayPrestigeTypeInTopBar"]);
    },

    readSelectedValue(): string {
      const settings = requireRecord(getSettings(), "settings");
      return requireString(settings["prestigeType"], "settings.prestigeType");
    },

    readTypeOptions(): readonly PrestigeTopBarTypeOption[] {
      const rawOptions = getPrestigeTypes();
      if (!Array.isArray(rawOptions)) {
        throw new TypeError("prestigeTypes must be an array");
      }

      return Object.freeze(
        rawOptions.map((rawOption, index) => {
          const option = requireRecord(rawOption, `prestigeTypes[${index}]`);
          return Object.freeze({
            value: requireString(option["val"], `prestigeTypes[${index}].val`),
            label: requireString(
              option["label"],
              `prestigeTypes[${index}].label`,
            ),
            hint: requireString(option["hint"], `prestigeTypes[${index}].hint`),
          });
        }),
      );
    },
  });
}
