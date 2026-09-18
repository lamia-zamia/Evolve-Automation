/** Captured read/write adapter for the Ejector, Supply & Nanite settings surface. */

import {
  createEjectorSettingsReadModel,
  type EjectorSettingsReadModel,
} from "../../../../domain/economy/resources/ejector-settings.ts";
import { computeEjectorDefaults } from "../../../../domain/settings-defaults.ts";
import type { EjectorResetContext } from "../../../../domain/settings-defaults.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { readEjector } from "../../captured-settings-defaults.ts";
import { isRecord } from "../../../validation.ts";
import {
  readCapturedEjectorSettingsEntries,
  type CapturedEjectorSettingsEntry,
} from "./captured-ejector-settings-catalog.ts";

export interface CapturedEjectorSettingsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getSettingsRaw: () => unknown;
}

export interface CapturedEjectorSettingsAdapter {
  readEjectorSettingsReadModel(): EjectorSettingsReadModel;
  resetToDefaults(): void;
}

/** The dynamic override prefixes the lifecycle owns for the ejector section. */
const EJECTOR_OVERRIDE_PREFIXES: readonly string[] = Object.freeze([
  "res_eject",
  "res_supply",
  "res_nanite",
]);

function readCapturedEjectorSettingsRecord(
  raw: unknown,
): Record<string, unknown> {
  return isRecord(raw) ? raw : {};
}

function readEjectorContext(
  rootState: GameRootStateSource,
  controls: GameControlRegistry,
): EjectorResetContext {
  return readEjector(rootState.readRoot(), controls);
}

export function createCapturedEjectorSettingsAdapter({
  rootState,
  controls,
  getSettingsRaw,
}: CapturedEjectorSettingsDependencies): CapturedEjectorSettingsAdapter {
  const readModel = (): EjectorSettingsReadModel => {
    const raw = readCapturedEjectorSettingsRecord(getSettingsRaw());
    const entries: readonly Readonly<CapturedEjectorSettingsEntry>[] =
      readCapturedEjectorSettingsEntries(rootState.readRoot(), controls);
    return createEjectorSettingsReadModel(
      entries.map((entry) => ({
        id: entry.resourceId,
        label: entry.label,
        color: entry.color,
        atomicMass: entry.atomicMass,
        ejectEnabled: raw[`res_eject${entry.resourceId}`] === true,
        naniteEnabled: raw[`res_nanite${entry.resourceId}`] === true,
        supplyEnabled: raw[`res_supply${entry.resourceId}`] === true,
        ejectSettingName: `res_eject${entry.resourceId}`,
        naniteSettingName: `res_nanite${entry.resourceId}`,
        supplySettingName: `res_supply${entry.resourceId}`,
        supplyOut: entry.supplyOut,
        supplyIn: entry.supplyIn,
        showEject: entry.ejectConsumable,
        showNanite: entry.naniteConsumable,
        showSupply: entry.supplyConsumable,
      })),
    );
  };

  return Object.freeze({
    readEjectorSettingsReadModel: readModel,
    resetToDefaults() {
      const raw = readCapturedEjectorSettingsRecord(getSettingsRaw());
      const defaults = computeEjectorDefaults(
        readEjectorContext(rootState, controls),
      ).def;
      const overrides = raw["overrides"];
      if (isRecord(overrides) && !Array.isArray(overrides)) {
        for (const key of Object.keys(overrides)) {
          if (
            EJECTOR_OVERRIDE_PREFIXES.some((prefix) => key.startsWith(prefix))
          ) {
            delete overrides[key];
          }
        }
      }
      Object.assign(raw, defaults);
    },
  });
}
