import { planTradeRoutes } from "../../../../domain/economy/market/trade-routes.ts";
import { readCapturedInflationSaveMoney } from "../resources/captured-inflation-assist.ts";
import {
  planRegionalTradeRoutes,
  type RegionalTradeResourceInput,
  type RegionalTradeRoutesInput,
} from "../../../../domain/economy/market/regional-trade-routes.ts";
import type {
  TradeResourceView,
  TradeRoutesInput,
} from "../../../../domain/economy/market/trade-routes.ts";
import type { TradeRouteAdjuster } from "../../../../ports/market.ts";
import type { GameControlHandle } from "../../../../ports/game-control-registry.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { finite, isRecord, readProperty } from "../../../validation.ts";
import {
  TRADE_ROUTE_RATIO,
  tradeRoutePrices,
  tradeRouteSellQuantity,
  unsupportedTradePriceModifier,
} from "./trade-price-mirror.ts";

interface CapturedTradeRoutesDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readDemand?: () => {
    readonly isDemanded: (resourceId: string) => boolean;
    readonly storageRequired: (resourceId: string) => number;
  };
  readonly onUnavailable?: (reason: string) => void;
}

interface RouteSession {
  readonly root: unknown;
  readonly market: Record<PropertyKey, unknown>;
  readonly routeCounts: ReadonlyMap<string, number>;
  readonly controls: ReadonlyMap<string, GameControlHandle>;
  readonly marketRouteCount: number;
}

interface RegionalRouteSession {
  readonly root: unknown;
  readonly market: Record<PropertyKey, unknown>;
  readonly selectedZone: unknown;
  readonly expectedRoutes: Map<string, number>;
  readonly controls: ReadonlyMap<string, GameControlHandle>;
}

interface RegionalRouteCapture {
  readonly input: Readonly<RegionalTradeRoutesInput>;
  readonly session: RegionalRouteSession;
}

const BLACK_MARKET_VOLUMES: Readonly<Record<string, number>> = Object.freeze({
  Food: 20,
  Lumber: 20,
  Chrysotile: 10,
  Stone: 20,
  Crystal: 4,
  Furs: 10,
  Copper: 10,
  Iron: 10,
  Aluminium: 10,
  Cement: 10,
  Coal: 10,
  Oil: 5,
  Uranium: 1.2,
  Steel: 5,
  Titanium: 2.5,
  Alloy: 2,
  Polymer: 2,
  Iridium: 1,
  Helium_3: 1,
  Elerium: 0.2,
  Water: 20,
  Neutronium: 0.5,
  Adamantite: 0.5,
  Nano_Tube: 10,
  Graphene: 1,
  Stanene: 1,
  Bolognium: 1.2,
  Orichalcum: 0.5,
  Unobtainium: 0.25,
  Plywood: 1,
  Brick: 1,
  Wrought_Iron: 1,
  Sheet_Metal: 1,
  Mythril: 1,
  Quantium: 1,
  Aerographene: 1,
});

const REGIONAL_PRIORITY = Object.freeze([
  "Food",
  "Oil",
  "Helium_3",
  "Elerium",
  "Coal",
  "Water",
]);

function settingsRecord(value: unknown): Record<PropertyKey, unknown> {
  return isRecord(value) ? value : {};
}

/**
 * The regional black-market path still restates upstream `tradeVolumeBonus()`, so it keeps its own
 * bail list. Every term that function multiplies in and this adapter does not model belongs here.
 * Trade-route *prices* are answered by `trade-price-mirror.ts` and are not gated by this.
 */
function hasUnsupportedRegionalVolumeModifier(root: unknown): boolean {
  const race = readProperty(root, "race");
  const genes = readProperty(root, "genes");
  const governor = readProperty(race, "governor");
  const governorType = readProperty(readProperty(governor, "g"), "bg");
  const gov3 = readProperty(
    readProperty(readProperty(root, "civic"), "foreign"),
    "gov3",
  );
  const achieve = readProperty(readProperty(root, "stats"), "achieve");
  return Boolean(
    readProperty(genes, "trader") ||
    readProperty(race, "persuasive") ||
    readProperty(race, "ocular_power") ||
    readProperty(race, "devious") ||
    readProperty(race, "merchant") ||
    readProperty(race, "empowered") ||
    readProperty(race, "unfathomable") ||
    readProperty(race, "truepath") ||
    readProperty(achieve, "trade") ||
    readProperty(gov3, "hstl") !== undefined ||
    governorType === "dealmaker",
  );
}

function routeUnlocked(
  root: unknown,
  resourceId: string,
  resource: Record<PropertyKey, unknown>,
): boolean {
  if (resource["display"] !== true) return false;
  const race = readProperty(root, "race");
  const tech = readProperty(root, "tech");
  if (
    resourceId === "Food" &&
    (readProperty(race, "artifical") || readProperty(race, "fasting"))
  )
    return false;
  if (resourceId === "Lumber" && readProperty(race, "iceage")) return false;
  if (resourceId === "Food" && readProperty(race, "banana")) return true;
  return readProperty(tech, "trade")
    ? !readProperty(race, "terrifying")
    : false;
}

function readRouteInput(
  dependencies: CapturedTradeRoutesDependencies,
):
  | { readonly input: TradeRoutesInput; readonly session: RouteSession }
  | undefined {
  const root = dependencies.rootState.readRoot();
  if (root === undefined) return undefined;
  const unsupported = unsupportedTradePriceModifier(root);
  if (unsupported !== undefined) {
    dependencies.onUnavailable?.(
      `trade-route prices do not model ${unsupported}`,
    );
    return undefined;
  }
  const cityMarket = readProperty(readProperty(root, "city"), "market");
  const resources = readProperty(root, "resource");
  const tech = readProperty(root, "tech");
  const currency = finite(readProperty(tech, "currency")) ?? 0;
  const money = readProperty(resources, "Money");
  if (!isRecord(cityMarket) || !isRecord(resources) || !isRecord(money))
    return undefined;
  // When regional storage exists, upstream ignores these global route counts and books the
  // per-pool black-market ledger instead. Do not assign routes the game will not consume.
  if (Object.hasOwn(cityMarket, "bm")) return undefined;
  const maximum = finite(cityMarket["mtrade"]);
  const used = finite(cityMarket["trade"]);
  const moneyRate = finite(money["diff"]);
  const moneyMaximum = finite(money["max"]);
  const moneyCurrent = finite(money["amount"]);
  if (
    maximum === undefined ||
    used === undefined ||
    moneyRate === undefined ||
    moneyMaximum === undefined ||
    moneyCurrent === undefined ||
    !Number.isSafeInteger(maximum) ||
    !Number.isSafeInteger(used) ||
    maximum < 0 ||
    used < 0
  ) {
    return undefined;
  }

  const settings = settingsRecord(dependencies.readSettings());
  const demand = dependencies.readDemand?.() ?? {
    isDemanded: () => false,
    storageRequired: () => 1,
  };
  const routeCounts = new Map<string, number>();
  const routeControls = new Map<string, GameControlHandle>();
  const priority: {
    readonly id: string;
    readonly index: number;
    readonly value: number;
  }[] = [];
  for (const [index, resourceId] of Object.keys(resources).entries()) {
    const resource = readProperty(resources, resourceId);
    const ratio = TRADE_ROUTE_RATIO[resourceId];
    const trade = isRecord(resource) ? finite(resource["trade"]) : undefined;
    if (!isRecord(resource) || ratio === undefined || trade === undefined)
      continue;
    if (!Number.isSafeInteger(trade)) return undefined;
    if (!routeUnlocked(root, resourceId, resource)) continue;
    const control = dependencies.controls.resolve(`market-${resourceId}`);
    if (
      control === undefined ||
      !control.methods.includes("autoBuy") ||
      !control.methods.includes("autoSell") ||
      !control.methods.includes("zero")
    ) {
      return undefined;
    }
    const marketPriority =
      finite(settings[`res_buy_p_${resourceId}`]) ?? Number.MAX_SAFE_INTEGER;
    priority.push({ id: resourceId, index, value: marketPriority });
    routeCounts.set(resourceId, trade);
    routeControls.set(resourceId, control);
  }
  priority.sort(
    (left, right) => left.value - right.value || left.index - right.index,
  );

  const views: TradeResourceView[] = [];
  let unmanaged = 0;
  for (const entry of priority) {
    const resource = readProperty(resources, entry.id);
    if (!isRecord(resource)) return undefined;
    const amount = finite(resource["amount"]);
    const maximumResource = finite(resource["max"]);
    const diff = finite(resource["diff"]);
    const ratio = tradeRouteSellQuantity(root, entry.id);
    if (ratio === undefined) return undefined;
    const prices = tradeRoutePrices(root, entry.id, resource);
    const required = finite(demand.storageRequired(entry.id));
    if (
      amount === undefined ||
      maximumResource === undefined ||
      diff === undefined ||
      required === undefined ||
      prices === undefined ||
      maximumResource < 0 ||
      required <= 0
    ) {
      return undefined;
    }
    const storageRatio = maximumResource > 0 ? amount / maximumResource : 1;
    const usefulRatio =
      maximumResource > 0 ? amount / Math.min(maximumResource, required) : 1;
    const buyEnabled = settings[`res_trade_buy_${entry.id}`] === true;
    const sellEnabled = settings[`res_trade_sell_${entry.id}`] === true;
    if (!buyEnabled && !sellEnabled)
      unmanaged += routeCounts.get(entry.id) ?? 0;
    views.push(
      Object.freeze({
        id: entry.id,
        tradeRoutes: routeCounts.get(entry.id) ?? 0,
        autoTradeBuyEnabled: buyEnabled,
        autoTradeSellEnabled: sellEnabled,
        usefulRatio,
        storageRatio,
        tradeSellPrice: prices.sell,
        tradeBuyPrice: prices.buy,
        rateOfChange: diff,
        tradeRouteQuantity: ratio,
        autoTradeWeighting: finite(settings[`res_trade_w_${entry.id}`]) ?? 0,
        autoTradePriority: finite(settings[`res_trade_p_${entry.id}`]) ?? 0,
        isRoutesUnlocked: true,
        isDemanded: demand.isDemanded(entry.id),
      }),
    );
  }

  const race = readProperty(root, "race");
  const governor = readProperty(readProperty(race, "governor"), "g");
  const input: TradeRoutesInput = Object.freeze({
    settings: Object.freeze({
      tradeRouteSellExcess: settings["tradeRouteSellExcess"] === true,
      tradeRouteMinimumMoneyPerSecond:
        finite(settings["tradeRouteMinimumMoneyPerSecond"]) ?? 0,
      tradeRouteMinimumMoneyPercentage:
        finite(settings["tradeRouteMinimumMoneyPercentage"]) ?? 0,
    }),
    priorityList: Object.freeze(views),
    money: Object.freeze({
      rateOfChange: moneyRate,
      maxQuantity: moneyMaximum,
      currentQuantity: moneyCurrent,
      isDemanded: demand.isDemanded("Money"),
    }),
    importRouteCap: currency >= 6 ? 1_000_000 : currency >= 4 ? 100 : 25,
    exportRouteCap: readProperty(race, "banana")
      ? currency >= 6
        ? 1_000_000
        : currency >= 4
          ? 25
          : 10
      : currency >= 6
        ? 1_000_000
        : currency >= 4
          ? 100
          : 25,
    maxTradeRoutes: maximum,
    unmanagedTradeRoutes: unmanaged,
    isBanana: Boolean(readProperty(race, "banana")),
    isEntrepreneur: readProperty(governor, "bg") === "entrepreneur",
    saveInflationMoney: readCapturedInflationSaveMoney(root, settings),
  });
  return Object.freeze({
    input,
    session: Object.freeze({
      root,
      market: cityMarket,
      routeCounts,
      controls: routeControls,
      marketRouteCount: used,
    }),
  });
}

function regionalPoolRoute(
  ledger: Record<PropertyKey, unknown>,
  pool: string,
  resourceId: string,
): number | undefined {
  const poolLedger = readProperty(ledger, pool);
  if (poolLedger === undefined) return 0;
  if (!isRecord(poolLedger)) return undefined;
  const value = readProperty(poolLedger, resourceId);
  if (value === undefined) return 0;
  return finite(value);
}

function readRegionalRouteInput(
  dependencies: CapturedTradeRoutesDependencies,
): RegionalRouteCapture | undefined {
  const root = dependencies.rootState.readRoot();
  const tech = readProperty(root, "tech");
  const shadow = finite(readProperty(tech, "shadow"));
  if (root === undefined || shadow === undefined || shadow < 5)
    return undefined;
  if (hasUnsupportedRegionalVolumeModifier(root)) {
    dependencies.onUnavailable?.(
      "regional black-market volume modifiers are not captured",
    );
    return undefined;
  }

  const city = readProperty(root, "city");
  const market = readProperty(city, "market");
  const resources = readProperty(root, "resource");
  const race = readProperty(root, "race");
  const governor = readProperty(race, "governor");
  const config = readProperty(governor, "config");
  const trader = readProperty(config, "trader");
  if (!isRecord(market) || !isRecord(resources)) return undefined;

  const maximumRoutes = finite(market["mtrade"]);
  const money = finite(
    readProperty(readProperty(resources, "Money"), "amount"),
  );
  if (
    maximumRoutes === undefined ||
    !Number.isSafeInteger(maximumRoutes) ||
    maximumRoutes < 0 ||
    money === undefined
  ) {
    return undefined;
  }
  const marginValue = isRecord(trader) ? finite(trader["margin"]) : undefined;
  const reserveValue = isRecord(trader) ? finite(trader["reserve"]) : undefined;
  const margin = marginValue !== undefined && marginValue > 0 ? marginValue : 0;
  const reserve =
    reserveValue !== undefined && reserveValue > 0 ? reserveValue : 0;

  const blackMarket = readProperty(market, "bm");
  const ledger = isRecord(blackMarket) ? blackMarket : {};
  const poolNames = new Set<string>();
  const routeCounts = new Map<string, number>();
  for (const value of Object.keys(ledger)) poolNames.add(value);

  const candidates: RegionalTradeResourceInput[] = [];
  for (const resourceId of Object.keys(BLACK_MARKET_VOLUMES)) {
    const resource = readProperty(resources, resourceId);
    if (!isRecord(resource) || resource["display"] !== true) continue;
    const diffLedger = readProperty(resource, "regDiff");
    // `supply.js:regDiff` lazily creates this ledger and returns an empty object before the
    // regional reckoning has written its first rate. Preserve that lenient upstream state.
    if (diffLedger === undefined) continue;
    if (!isRecord(diffLedger)) return undefined;
    for (const pool of Object.keys(diffLedger)) poolNames.add(pool);
  }
  if (poolNames.size === 0) return undefined;

  const controls = new Map<string, GameControlHandle>();
  for (const pool of poolNames) {
    for (const [resourceId, volume] of Object.entries(BLACK_MARKET_VOLUMES)) {
      const resource = readProperty(resources, resourceId);
      if (!isRecord(resource) || resource["display"] !== true) continue;
      const diffLedger = readProperty(resource, "regDiff");
      if (diffLedger !== undefined && !isRecord(diffLedger)) return undefined;
      const rateOfChange =
        finite(isRecord(diffLedger) ? diffLedger[pool] : undefined) ?? 0;
      const currentRoutes = regionalPoolRoute(ledger, pool, resourceId);
      if (
        currentRoutes === undefined ||
        !Number.isSafeInteger(currentRoutes) ||
        currentRoutes < 0
      ) {
        return undefined;
      }
      if (currentRoutes > 0)
        routeCounts.set(`${pool}\u0000${resourceId}`, currentRoutes);
      const priorityIndex = REGIONAL_PRIORITY.indexOf(resourceId);
      candidates.push({
        resourceId,
        pool,
        rateOfChange,
        currentRoutes,
        volume,
        priority: priorityIndex < 0 ? REGIONAL_PRIORITY.length : priorityIndex,
      });
    }
  }

  for (const candidate of candidates) {
    const key = `${candidate.pool}\u0000${candidate.resourceId}`;
    const needsControl =
      candidate.rateOfChange < 0 || candidate.currentRoutes > 0;
    if (!needsControl) continue;
    const control = dependencies.controls.resolve(`bm-${candidate.resourceId}`);
    if (
      control === undefined ||
      !control.methods.includes("more") ||
      !control.methods.includes("less")
    ) {
      return undefined;
    }
    controls.set(candidate.resourceId, control);
    if (!routeCounts.has(key)) routeCounts.set(key, candidate.currentRoutes);
  }

  const expectedRoutes = new Map(routeCounts);
  const input: RegionalTradeRoutesInput = Object.freeze({
    resources: Object.freeze(
      candidates.map((candidate) => Object.freeze(candidate)),
    ),
    maximumRoutes,
    money,
    reserve,
    margin,
  });
  return Object.freeze({
    input,
    session: Object.freeze({
      root,
      market,
      selectedZone: market["bmZone"],
      expectedRoutes,
      controls,
    }),
  });
}

function applyRegionalTradeRoutes(
  dependencies: CapturedTradeRoutesDependencies,
  captured: RegionalRouteCapture | undefined,
): void {
  if (captured === undefined) return;
  const result = planRegionalTradeRoutes(captured.input);
  if (result.operations.length === 0) return;
  const multiplier = dependencies.controls.resolve(
    "marketRouteMultiplier",
  )?.data;
  if (
    isRecord(multiplier) &&
    multiplier["multiplier"] !== undefined &&
    multiplier["multiplier"] !== 1
  )
    return;

  const market = captured.session.market;
  try {
    for (const operation of result.operations) {
      const control = captured.session.controls.get(operation.resourceId);
      if (control === undefined) return;
      for (let index = 0; index < operation.count; index += 1) {
        if (dependencies.rootState.readRoot() !== captured.session.root) return;
        const key = `${operation.pool}\u0000${operation.resourceId}`;
        const expected = captured.session.expectedRoutes.get(key) ?? 0;
        const actual = regionalPoolRoute(
          isRecord(market["bm"]) ? market["bm"] : {},
          operation.pool,
          operation.resourceId,
        );
        if (actual !== expected) return;
        market["bmZone"] = operation.pool;
        const method = operation.kind === "add" ? "more" : "less";
        const invoked = dependencies.controls.invoke(control, method);
        if (!invoked.ok) return;
        const next = regionalPoolRoute(
          isRecord(market["bm"]) ? market["bm"] : {},
          operation.pool,
          operation.resourceId,
        );
        const expectedNext = expected + (operation.kind === "add" ? 1 : -1);
        if (next !== expectedNext) return;
        captured.session.expectedRoutes.set(key, expectedNext);
      }
    }
  } finally {
    market["bmZone"] = captured.session.selectedZone;
  }
}

export function createCapturedTradeRoutes(
  dependencies: CapturedTradeRoutesDependencies,
): TradeRouteAdjuster {
  return Object.freeze({
    adjust(): void {
      const regional = readRegionalRouteInput(dependencies);
      if (regional !== undefined) {
        applyRegionalTradeRoutes(dependencies, regional);
        return;
      }
      const root = dependencies.rootState.readRoot();
      const shadow = finite(readProperty(readProperty(root, "tech"), "shadow"));
      if (shadow !== undefined && shadow >= 5) return;
      const captured = readRouteInput(dependencies);
      if (captured === undefined) return;
      const result = planTradeRoutes(captured.input);
      if (dependencies.rootState.readRoot() !== captured.session.root) return;
      const current = readProperty(
        readProperty(captured.session.root, "city"),
        "market",
      );
      if (
        !isRecord(current) ||
        current !== captured.session.market ||
        finite(current["trade"]) !== captured.session.marketRouteCount
      )
        return;
      for (const [resourceId, routes] of captured.session.routeCounts) {
        const resource = readProperty(
          readProperty(captured.session.root, "resource"),
          resourceId,
        );
        if (!isRecord(resource) || finite(resource["trade"]) !== routes) return;
      }

      const expected = new Map(captured.session.routeCounts);
      for (const operation of result.operations) {
        const control = captured.session.controls.get(operation.resourceId);
        if (control === undefined) return;
        const method =
          operation.kind === "zero"
            ? "zero"
            : operation.kind === "add"
              ? "autoBuy"
              : "autoSell";
        if (operation.kind === "zero") expected.set(operation.resourceId, 0);
        else
          expected.set(
            operation.resourceId,
            (expected.get(operation.resourceId) ?? 0) +
              (operation.kind === "add" ? operation.count : -operation.count),
          );
        const count = operation.kind === "zero" ? 1 : operation.count;
        for (let index = 0; index < count; index += 1) {
          const invoked = dependencies.controls.invoke(control, method, [
            operation.resourceId,
            1,
          ]);
          if (!invoked.ok) return;
        }
      }
      const liveResources = readProperty(captured.session.root, "resource");
      const finalMarket = readProperty(
        readProperty(captured.session.root, "city"),
        "market",
      );
      if (!isRecord(liveResources) || !isRecord(finalMarket)) return;
      const expectedTotal = [...expected.values()].reduce(
        (sum, value) => sum + Math.abs(value),
        0,
      );
      if (finite(finalMarket["trade"]) !== expectedTotal) return;
      for (const [resourceId, value] of expected) {
        if (
          finite(
            readProperty(readProperty(liveResources, resourceId), "trade"),
          ) !== value
        )
          return;
      }
      // The game recomputes Money.diff during the next period. The old manager's writeback is not
      // valid on DeadSpace, whose resource record owns that derived value.
    },
  });
}
