/** Captured read/write adapter for the Magic settings surface. */

import {
  createMagicSettingsReadModel,
  type MagicSettingsReadModel,
} from "../../../../domain/economy/production/magic-settings.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import {
  readCapturedMagicAlchemyEntries,
  readCapturedMagicPylonEntries,
} from "./captured-magic-settings-catalog.ts";

export interface CapturedMagicSettingsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
}

export interface CapturedMagicSettingsAdapter {
  readMagicSettingsReadModel(): MagicSettingsReadModel;
}

export function createCapturedMagicSettingsAdapter({
  rootState,
  controls,
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
  });
}
