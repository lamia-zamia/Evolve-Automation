/** Captured read/write adapter for the Magic settings surface. */

import {
  createMagicSettingsReadModel,
  type MagicSettingsReadModel,
} from "../../../../domain/economy/production/magic-settings.ts";
import { computeMagicDefaults } from "../../../../domain/settings-defaults.ts";
import type { MagicResetContext } from "../../../../domain/settings-defaults.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { readMagicResetContext } from "../../captured-settings-defaults.ts";
import { isRecord } from "../../../validation.ts";
import {
  readCapturedMagicAlchemyEntries,
  readCapturedMagicPylonEntries,
} from "./captured-magic-settings-catalog.ts";

export interface CapturedMagicSettingsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getSettingsRaw: () => unknown;
}

export interface CapturedMagicSettingsAdapter {
  readMagicSettingsReadModel(): MagicSettingsReadModel;
  resetToDefaults(): void;
}

/** The dynamic override prefixes the lifecycle owns for the magic section. */
const MAGIC_OVERRIDE_PREFIXES: readonly string[] = Object.freeze([
  "res_alchemy_",
  "spell_w_",
]);

function readCapturedMagicSettingsRecord(
  raw: unknown,
): Record<string, unknown> {
  return isRecord(raw) ? raw : {};
}

function readMagicContext(controls: GameControlRegistry): MagicResetContext {
  return readMagicResetContext(controls);
}

export function createCapturedMagicSettingsAdapter({
  rootState,
  controls,
  getSettingsRaw,
}: CapturedMagicSettingsDependencies): CapturedMagicSettingsAdapter {
  const readModel = (): MagicSettingsReadModel => {
    const root = rootState.readRoot();
    return createMagicSettingsReadModel({
      alchemyRows: readCapturedMagicAlchemyEntries(root, controls).map(
        (entry) => ({
          id: entry.resourceId,
          label: entry.label,
          color: entry.color,
          enabledSettingName: `res_alchemy_${entry.resourceId}`,
          weightingSettingName: `res_alchemy_w_${entry.resourceId}`,
        }),
      ),
      pylonRows: readCapturedMagicPylonEntries().map((entry) => ({
        id: entry.spellId,
        label: entry.label,
        weightingSettingName: `spell_w_${entry.spellId}`,
      })),
    });
  };

  return Object.freeze({
    readMagicSettingsReadModel: readModel,
    resetToDefaults() {
      const raw = readCapturedMagicSettingsRecord(getSettingsRaw());
      const defaults = computeMagicDefaults(readMagicContext(controls)).def;
      const overrides = raw["overrides"];
      if (isRecord(overrides) && !Array.isArray(overrides)) {
        for (const key of Object.keys(overrides)) {
          if (
            MAGIC_OVERRIDE_PREFIXES.some((prefix) => key.startsWith(prefix))
          ) {
            delete overrides[key];
          }
        }
      }
      Object.assign(raw, defaults);
    },
  });
}
