/** Captured read/write adapter for the Production settings surface. */

import { CONSUMPTION_BALANCE_TARGET } from "../../../../config.ts";
import {
  createProductionSettingsReadModel,
  type ProductionSettingsReadModel,
} from "../../../../domain/economy/production/production-settings.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
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
  reorderSmelterFuels(fuelIds: readonly string[]): void;
}

function readCapturedProductionSettingsRecord(
  raw: unknown,
): Record<string, unknown> {
  return isRecord(raw) ? raw : {};
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
