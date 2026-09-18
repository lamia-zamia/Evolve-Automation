/** Captured read/write adapter for the Production settings surface. */

import { CONSUMPTION_BALANCE_TARGET } from "../../../../config.ts";
import {
  createProductionSettingsReadModel,
  type ProductionSettingsReadModel,
} from "../../../../domain/economy/production/production-settings.ts";
import {
  computeProductionDefaults,
  type ProductionResetContext,
} from "../../../../domain/settings-defaults.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { readProduction } from "../../captured-settings-defaults.ts";
import { isRecord } from "../../../validation.ts";
import {
  readCapturedFactoryRows,
  readCapturedFoundryRows,
  readCapturedMiningDroidRows,
  readCapturedReplicatorRows,
  readCapturedSmelterFuelRows,
} from "./captured-production-settings-catalog.ts";

export interface CapturedProductionSettingsDependencies {
  readonly rootState: GameRootStateSource;
  readonly getSettingsRaw: () => unknown;
}

export interface CapturedProductionSettingsAdapter {
  readProductionSettingsReadModel(): ProductionSettingsReadModel;
  resetToDefaults(): void;
  reorderSmelterFuels(fuelIds: readonly string[]): void;
}

/** The dynamic override prefixes the lifecycle owns for the production section. */
const PRODUCTION_OVERRIDE_PREFIXES: readonly string[] = Object.freeze([
  "craft",
  "foundry_",
  "production_",
  "droid_",
  "replicator_",
  "smelter_",
  "job_",
]);

function readCapturedProductionSettingsRecord(
  raw: unknown,
): Record<string, unknown> {
  return isRecord(raw) ? raw : {};
}

function readProductionContext(
  rootState: GameRootStateSource,
): ProductionResetContext {
  return readProduction(rootState.readRoot());
}

export function createCapturedProductionSettingsAdapter({
  rootState,
  getSettingsRaw,
}: CapturedProductionSettingsDependencies): CapturedProductionSettingsAdapter {
  const readModel = (): ProductionSettingsReadModel =>
    createProductionSettingsReadModel({
      consumptionBalanceTarget: CONSUMPTION_BALANCE_TARGET,
      smelterFuels: readCapturedSmelterFuelRows(getSettingsRaw),
      foundryRows: readCapturedFoundryRows(rootState),
      factoryRows: readCapturedFactoryRows(rootState),
      miningDroidRows: readCapturedMiningDroidRows(rootState),
      replicatorRows: readCapturedReplicatorRows(rootState),
    });

  return Object.freeze({
    readProductionSettingsReadModel: readModel,
    resetToDefaults() {
      const raw = readCapturedProductionSettingsRecord(getSettingsRaw());
      const defaults = computeProductionDefaults(
        readProductionContext(rootState),
      ).def;
      const overrides = raw["overrides"];
      if (isRecord(overrides) && !Array.isArray(overrides)) {
        for (const key of Object.keys(overrides)) {
          if (
            PRODUCTION_OVERRIDE_PREFIXES.some((prefix) =>
              key.startsWith(prefix),
            )
          ) {
            delete overrides[key];
          }
        }
      }
      Object.assign(raw, defaults);
    },
    reorderSmelterFuels(fuelIds: readonly string[]) {
      const raw = readCapturedProductionSettingsRecord(getSettingsRaw());
      const known = new Set(
        readCapturedSmelterFuelRows(getSettingsRaw).map((fuel) => fuel.id),
      );
      fuelIds.forEach((fuelId: string, index: number) => {
        if (known.has(fuelId)) raw[`smelter_fuel_p_${fuelId}`] = index;
      });
    },
  });
}
