import { requireFunction, requireRecord } from "../../../validation.ts";
import {
  createMarketSettingsReadModel,
  type MarketSettingsGalaxyRow,
  type MarketSettingsReadModel,
  type MarketSettingsRow,
} from "../../../../domain/economy/market/market-settings.ts";
import type { MarketSettingsReader } from "../../../../ports/market-settings.ts";

export interface MarketSettingsEvolveDependencies {
  readonly getMarketManager: () => unknown;
  readonly getResources: () => unknown;
  readonly getPoly: () => unknown;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

function readResource(
  value: unknown,
  path: string,
): { id: string; name: string } {
  const resource = requireRecord(value, path);
  return {
    id: requireString(resource["id"], `${path}.id`),
    name: requireString(resource["name"], `${path}.name`),
  };
}

function readMarketRows(managerValue: unknown): readonly MarketSettingsRow[] {
  const manager = requireRecord(managerValue, "MarketManager");
  if (!Array.isArray(manager["priorityList"])) {
    throw new TypeError("MarketManager.priorityList must be an array");
  }
  return Object.freeze(
    manager["priorityList"].map((rawResource, index) => {
      const resource = readResource(
        rawResource,
        `MarketManager.priorityList[${index}]`,
      );
      const id = resource.id;
      return Object.freeze({
        id,
        label: resource.name,
        buySettingName: `buy${id}`,
        buyRatioSettingName: `res_buy_r_${id}`,
        sellSettingName: `sell${id}`,
        sellRatioSettingName: `res_sell_r_${id}`,
        tradeBuySettingName: `res_trade_buy_${id}`,
        tradeSellSettingName: `res_trade_sell_${id}`,
        tradeWeightingSettingName: `res_trade_w_${id}`,
        tradePrioritySettingName: `res_trade_p_${id}`,
      });
    }),
  );
}

function readGalaxyRows(
  polyValue: unknown,
  resourcesValue: unknown,
): readonly MarketSettingsGalaxyRow[] {
  const poly = requireRecord(polyValue, "poly");
  const resources = requireRecord(resourcesValue, "resources");
  if (!Array.isArray(poly["galaxyOffers"])) {
    throw new TypeError("poly.galaxyOffers must be an array");
  }
  return Object.freeze(
    poly["galaxyOffers"].map((rawOffer, index) => {
      const offer = requireRecord(rawOffer, `poly.galaxyOffers[${index}]`);
      const buy = requireRecord(
        offer["buy"],
        `poly.galaxyOffers[${index}].buy`,
      );
      const sell = requireRecord(
        offer["sell"],
        `poly.galaxyOffers[${index}].sell`,
      );
      const buyKey = requireString(
        buy["res"],
        `poly.galaxyOffers[${index}].buy.res`,
      );
      const sellKey = requireString(
        sell["res"],
        `poly.galaxyOffers[${index}].sell.res`,
      );
      const buyResource = readResource(
        resources[buyKey],
        `resources.${buyKey}`,
      );
      const sellResource = readResource(
        resources[sellKey],
        `resources.${sellKey}`,
      );
      return Object.freeze({
        buyId: buyResource.id,
        buyLabel: buyResource.name,
        sellLabel: sellResource.name,
        weightingSettingName: `res_galaxy_w_${buyResource.id}`,
        prioritySettingName: `res_galaxy_p_${buyResource.id}`,
      });
    }),
  );
}

/** Reads MarketManager and galaxy-offer catalogs for the Market settings panel. */
export function createMarketSettingsEvolveAdapter({
  getMarketManager,
  getResources,
  getPoly,
}: MarketSettingsEvolveDependencies): MarketSettingsReader {
  return Object.freeze({
    read(): MarketSettingsReadModel {
      return createMarketSettingsReadModel({
        rows: readMarketRows(getMarketManager()),
        galaxyRows: readGalaxyRows(getPoly(), getResources()),
      });
    },
  });
}

export function createMarketSettingsWriter({
  getMarketManager,
  getSettingsRaw,
}: Readonly<{
  getMarketManager: () => unknown;
  getSettingsRaw: () => unknown;
}>): {
  reorderResources(resourceIds: readonly string[]): void;
} {
  return {
    reorderResources(resourceIds): void {
      const manager = requireRecord(getMarketManager(), "MarketManager");
      const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");
      const sortByPriority = requireFunction(
        manager["sortByPriority"],
        "MarketManager.sortByPriority",
      );
      resourceIds.forEach(
        (resourceId, index) => (settingsRaw[`res_buy_p_${resourceId}`] = index),
      );
      Reflect.apply(sortByPriority, manager, []);
    },
  };
}
