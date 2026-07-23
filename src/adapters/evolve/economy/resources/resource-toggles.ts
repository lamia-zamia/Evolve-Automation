import { requireRecord } from "../../../validation.ts";
import type {
  MarketToggleItem,
  MarketToggleView,
  StorageToggleItem,
  StorageToggleView,
} from "../../../../domain/economy/resources/resource-toggles.ts";
import type { ResourceToggleReader } from "../../../../ports/resource-toggles.ts";

export interface ResourceToggleEvolveDependencies {
  readonly getGame: () => unknown;
  readonly getSettingsRaw: () => unknown;
  readonly getMarketManager: () => unknown;
  readonly getStorageManager: () => unknown;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

function requireFunction(
  value: unknown,
  path: string,
): (...args: readonly unknown[]) => unknown {
  if (typeof value !== "function") {
    throw new TypeError(`${path} must be a function`);
  }
  return value as (...args: readonly unknown[]) => unknown;
}

function readPriorityList(value: unknown, path: string): readonly unknown[] {
  const manager = requireRecord(value, path);
  const priorityList = manager["priorityList"];
  if (!Array.isArray(priorityList)) {
    throw new TypeError(`${path}.priorityList must be an array`);
  }
  return priorityList;
}

function readResourceId(value: unknown, path: string): string {
  return requireString(requireRecord(value, path)["id"], `${path}.id`);
}

/** Evolve adapter for market/storage catalogs, localized labels, and persisted toggle state. */
export function createResourceToggleEvolveAdapter({
  getGame,
  getSettingsRaw,
  getMarketManager,
  getStorageManager,
}: ResourceToggleEvolveDependencies): ResourceToggleReader {
  function readMarket(): MarketToggleView {
    const game = requireRecord(getGame(), "game");
    const global = requireRecord(game["global"], "game.global");
    const race = requireRecord(global["race"], "game.global.race");
    const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");
    const noTrade = Boolean(race["no_trade"]);
    const loc = requireFunction(game["loc"], "game.loc");

    const labels = noTrade
      ? Object.freeze({ buy: "", sell: "", routes: "", cancelRoutes: "" })
      : Object.freeze({
          buy: requireString(loc("resource_market_buy"), "game.loc(buy)"),
          sell: requireString(loc("resource_market_sell"), "game.loc(sell)"),
          routes: requireString(
            loc("resource_market_routes"),
            "game.loc(routes)",
          ),
          cancelRoutes: requireString(
            loc("cancel_routes"),
            "game.loc(cancel_routes)",
          ),
        });

    const items: MarketToggleItem[] = [];
    for (const [index, rawResource] of readPriorityList(
      getMarketManager(),
      "MarketManager",
    ).entries()) {
      const resourceId = readResourceId(
        rawResource,
        `MarketManager.priorityList[${index}]`,
      );
      if (
        resourceId === "Food" &&
        (Boolean(race["artifical"]) || Boolean(race["fasting"]))
      ) {
        continue;
      }
      const buyKey = `buy${resourceId}`;
      const sellKey = `sell${resourceId}`;
      const tradeBuyKey = `res_trade_buy_${resourceId}`;
      const tradeSellKey = `res_trade_sell_${resourceId}`;
      items.push(
        Object.freeze({
          resourceId,
          buyKey,
          sellKey,
          tradeBuyKey,
          tradeSellKey,
          buyEnabled: Boolean(settingsRaw[buyKey]),
          sellEnabled: Boolean(settingsRaw[sellKey]),
          tradeBuyEnabled: Boolean(settingsRaw[tradeBuyKey]),
          tradeSellEnabled: Boolean(settingsRaw[tradeSellKey]),
        }),
      );
    }

    return Object.freeze({
      noTrade,
      labels,
      items: Object.freeze(items),
    });
  }

  function readStorage(): StorageToggleView {
    const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");
    const items: StorageToggleItem[] = [];
    for (const [index, rawResource] of readPriorityList(
      getStorageManager(),
      "StorageManager",
    ).entries()) {
      const resourceId = readResourceId(
        rawResource,
        `StorageManager.priorityList[${index}]`,
      );
      const storeKey = `res_storage${resourceId}`;
      const overKey = `res_storage_o_${resourceId}`;
      items.push(
        Object.freeze({
          resourceId,
          storeKey,
          overKey,
          storeEnabled: Boolean(settingsRaw[storeKey]),
          overEnabled: Boolean(settingsRaw[overKey]),
        }),
      );
    }
    return Object.freeze({ items: Object.freeze(items) });
  }

  return Object.freeze({ readMarket, readStorage });
}
