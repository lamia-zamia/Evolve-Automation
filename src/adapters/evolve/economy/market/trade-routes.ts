import type {
  TradeMoneyView,
  TradeResourceView,
  TradeRoutesInput,
  TradeRoutesSettings,
} from "../../../../domain/economy/market/trade-routes.ts";
import {
  callBoolean,
  callNumber,
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../../../validation.ts";

export interface TradeRoutesReaderDependencies {
  readonly getSettings: () => unknown;
  readonly getGame: () => unknown;
  readonly getResources: () => unknown;
  readonly getMarketManager: () => unknown;
  readonly getGovernor: () => unknown;
  readonly shouldSaveInflationMoney: () => boolean;
}

function readResourceView(value: unknown, index: number): TradeResourceView {
  const path = `MarketManager.priorityList[${index}]`;
  const resource = requireRecord(value, path);
  const id = resource["id"];
  if (typeof id !== "string") {
    throw new TypeError(`${path}.id must be a string`);
  }
  const number = (name: string): number =>
    requireNumber(resource[name], `${path}.${name}`);
  return Object.freeze({
    id,
    tradeRoutes: number("tradeRoutes"),
    autoTradeBuyEnabled: Boolean(resource["autoTradeBuyEnabled"]),
    autoTradeSellEnabled: Boolean(resource["autoTradeSellEnabled"]),
    usefulRatio: number("usefulRatio"),
    storageRatio: number("storageRatio"),
    tradeSellPrice: number("tradeSellPrice"),
    tradeBuyPrice: number("tradeBuyPrice"),
    rateOfChange: number("rateOfChange"),
    tradeRouteQuantity: number("tradeRouteQuantity"),
    autoTradeWeighting: number("autoTradeWeighting"),
    autoTradePriority: number("autoTradePriority"),
    isRoutesUnlocked: callBoolean(resource, "isRoutesUnlocked", path),
    isDemanded: callBoolean(resource, "isDemanded", path),
  });
}

function readMoney(value: unknown): TradeMoneyView {
  const money = requireRecord(value, "resources.Money");
  return Object.freeze({
    rateOfChange: requireNumber(
      money["rateOfChange"],
      "resources.Money.rateOfChange",
    ),
    maxQuantity: requireNumber(
      money["maxQuantity"],
      "resources.Money.maxQuantity",
    ),
    currentQuantity: requireNumber(
      money["currentQuantity"],
      "resources.Money.currentQuantity",
    ),
    isDemanded: callBoolean(money, "isDemanded", "resources.Money"),
  });
}

function readSettings(value: unknown): TradeRoutesSettings {
  const settings = requireRecord(value, "settings");
  return Object.freeze({
    tradeRouteSellExcess: Boolean(settings["tradeRouteSellExcess"]),
    tradeRouteMinimumMoneyPerSecond: requireNumber(
      settings["tradeRouteMinimumMoneyPerSecond"],
      "settings.tradeRouteMinimumMoneyPerSecond",
    ),
    tradeRouteMinimumMoneyPercentage: requireNumber(
      settings["tradeRouteMinimumMoneyPercentage"],
      "settings.tradeRouteMinimumMoneyPercentage",
    ),
  });
}

/** Legacy `getMaxTradeRoutes()` returns a `[max, unmanaged]` tuple. */
function readMaxTradeRoutes(manager: UnknownRecord): [number, number] {
  const getMax = requireFunction(
    manager["getMaxTradeRoutes"],
    "MarketManager.getMaxTradeRoutes",
  );
  const tuple = Reflect.apply(getMax, manager, []);
  if (!Array.isArray(tuple)) {
    throw new TypeError(
      "MarketManager.getMaxTradeRoutes() must return an array",
    );
  }
  return [
    requireNumber(tuple[0], "MarketManager.getMaxTradeRoutes()[0]"),
    requireNumber(tuple[1], "MarketManager.getMaxTradeRoutes()[1]"),
  ];
}

export function readTradeRoutesInput(
  dependencies: TradeRoutesReaderDependencies,
): TradeRoutesInput {
  const resources = requireRecord(dependencies.getResources(), "resources");
  const manager = requireRecord(
    dependencies.getMarketManager(),
    "MarketManager",
  );
  const game = requireRecord(dependencies.getGame(), "game");
  const race = requireRecord(
    requireRecord(game["global"], "game.global")["race"],
    "game.global.race",
  );

  const priorityListRaw = manager["priorityList"];
  if (!Array.isArray(priorityListRaw)) {
    throw new TypeError("MarketManager.priorityList must be an array");
  }
  const [maxTradeRoutes, unmanagedTradeRoutes] = readMaxTradeRoutes(manager);

  return Object.freeze({
    settings: readSettings(dependencies.getSettings()),
    priorityList: Object.freeze(priorityListRaw.map(readResourceView)),
    money: readMoney(resources["Money"]),
    importRouteCap: callNumber(manager, "getImportRouteCap", "MarketManager"),
    exportRouteCap: callNumber(manager, "getExportRouteCap", "MarketManager"),
    maxTradeRoutes,
    unmanagedTradeRoutes,
    isBanana: Boolean(race["banana"]),
    isEntrepreneur: dependencies.getGovernor() === "entrepreneur",
    saveInflationMoney: dependencies.shouldSaveInflationMoney(),
  });
}
