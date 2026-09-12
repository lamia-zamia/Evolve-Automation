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

// This is the upstream tradeRatio catalog, not a second policy catalog. DeadSpace does not retain
// the lexical map on the captured root; the route controls need the per-route unit quantity to
// turn a resource's captured diff into a bounded export count.
const TRADE_RATIO: Readonly<Record<string, number>> = Object.freeze({
  Food: 2,
  Lumber: 2,
  Chrysotile: 1,
  Stone: 2,
  Crystal: 0.4,
  Furs: 1,
  Copper: 1,
  Iron: 1,
  Aluminium: 1,
  Cement: 1,
  Coal: 1,
  Oil: 0.5,
  Uranium: 0.12,
  Steel: 0.5,
  Titanium: 0.25,
  Alloy: 0.2,
  Polymer: 0.2,
  Iridium: 0.1,
  Helium_3: 0.1,
  Deuterium: 0.1,
  Elerium: 0.02,
  Water: 2,
  Neutronium: 0.05,
  Adamantite: 0.05,
  Infernite: 0.01,
  Nano_Tube: 0.1,
  Graphene: 0.1,
  Stanene: 0.1,
  Bolognium: 0.12,
  Vitreloy: 0.12,
  Orichalcum: 0.05,
});

const TRAIT_RANKS = Object.freeze([0.1, 0.25, 0.5, 1, 2, 3, 4]);
const TRAIT_VALUES = Object.freeze({
  arrogant: Object.freeze([16, 14, 12, 10, 8, 6, 5]),
  merchant: Object.freeze([5, 10, 15, 25, 35, 40, 45]),
  conniving: Object.freeze([1, 2, 3, 5, 8, 10, 12]),
  asymmetrical: Object.freeze([35, 30, 25, 20, 15, 10, 5]),
});

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

function traitPercent(
  race: Record<PropertyKey, unknown>,
  trait: keyof typeof TRAIT_VALUES,
): number | undefined {
  if (!race[trait]) return 0;
  const rank = finite(race[trait]);
  if (rank === undefined) return undefined;
  const index = TRAIT_RANKS.indexOf(rank);
  return index >= 0 ? TRAIT_VALUES[trait][index] : undefined;
}

function fathom(
  root: unknown,
  race: Record<PropertyKey, unknown>,
  target: string,
): number | undefined {
  if (!race["unfathomable"]) return 0;
  const city = readProperty(root, "city");
  const dwellers = readProperty(city, "surfaceDwellers");
  if (!Array.isArray(dwellers) || !dwellers.includes(target)) return 0;
  const housing = readProperty(city, "captive_housing");
  const workers = finite(
    readProperty(
      readProperty(readProperty(root, "civic"), "torturer"),
      "workers",
    ),
  );
  const index = dwellers.indexOf(target);
  const active = finite(readProperty(housing, `race${index}`));
  const nightmare = readProperty(
    readProperty(readProperty(root, "stats"), "achieve"),
    "nightmare",
  );
  const mg = finite(readProperty(nightmare, "mg"));
  if (workers === undefined || active === undefined) return undefined;
  let adjusted = Math.min(active, 100);
  if (adjusted > workers) adjusted -= Math.ceil((adjusted - workers) / 3);
  return (adjusted / 100) * ((mg ?? 0) / 5);
}

function hasUnsupportedPriceModifier(root: unknown): boolean {
  const race = readProperty(root, "race");
  const genes = readProperty(root, "genes");
  const tech = readProperty(root, "tech");
  const city = readProperty(root, "city");
  const space = readProperty(root, "space");
  const underground = readProperty(root, "underground");
  const stats = readProperty(readProperty(root, "stats"), "achieve");
  const civic = readProperty(root, "civic");
  const foreign = readProperty(civic, "foreign");
  const gov3 = readProperty(foreign, "gov3");

  return Boolean(
    readProperty(genes, "cunning") ||
    readProperty(genes, "trader") ||
    readProperty(race, "persuasive") ||
    readProperty(race, "ocular_power") ||
    readProperty(race, "devious") ||
    readProperty(race, "empowered") ||
    readProperty(race, "truepath") ||
    readProperty(race, "quarantine") ||
    readProperty(race, "witch_hunter") ||
    readProperty(city, "wharf") ||
    readProperty(space, "gps") ||
    readProperty(tech, "railway") ||
    readProperty(underground, "trade") ||
    readProperty(stats, "trade") ||
    readProperty(gov3, "hstl") !== undefined,
  );
}

function hasUnsupportedRegionalVolumeModifier(root: unknown): boolean {
  const race = readProperty(root, "race");
  const governor = readProperty(race, "governor");
  const governorType = readProperty(readProperty(governor, "g"), "bg");
  return (
    hasUnsupportedPriceModifier(root) ||
    Boolean(readProperty(race, "merchant")) ||
    Boolean(readProperty(race, "devious")) ||
    Boolean(readProperty(race, "unfathomable")) ||
    governorType === "dealmaker"
  );
}

function routePrices(
  root: unknown,
  resource: Record<PropertyKey, unknown>,
  ratio: number,
): { readonly buy: number; readonly sell: number } | undefined {
  const value = finite(resource["value"]);
  const race = readProperty(root, "race");
  if (value === undefined || value <= 0 || !isRecord(race)) return undefined;
  if (hasUnsupportedPriceModifier(root)) return undefined;
  const inflation = race["inflation"];
  if (
    inflation !== undefined &&
    inflation !== false &&
    (typeof inflation !== "number" || !Number.isFinite(inflation))
  ) {
    return undefined;
  }
  const inflationLevel = typeof inflation === "number" ? inflation : 0;
  const arrogant = traitPercent(race, "arrogant");
  const conniving = traitPercent(race, "conniving");
  const merchant = traitPercent(race, "merchant");
  const asymmetrical = traitPercent(race, "asymmetrical");
  const goblin = fathom(root, race, "goblin");
  const imp = fathom(root, race, "imp");
  if (
    arrogant === undefined ||
    conniving === undefined ||
    merchant === undefined ||
    asymmetrical === undefined ||
    goblin === undefined ||
    imp === undefined
  ) {
    return undefined;
  }
  const buy =
    value *
    ratio *
    (1 + arrogant / 100) *
    (1 - conniving / 100) *
    (1 - (imp * 5) / 100) *
    (1 + inflationLevel / 300);
  let divide =
    4 *
    (1 - merchant / 100) *
    (1 - (goblin * 25) / 100) *
    (1 + asymmetrical / 100);
  if (race["conniving"]) divide -= 1;
  const sell = ((value * ratio) / divide) * (1 + inflationLevel / 500);
  return Number.isFinite(buy) && Number.isFinite(sell) && divide > 0
    ? Object.freeze({ buy, sell })
    : undefined;
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
  if (root === undefined || hasUnsupportedPriceModifier(root)) {
    dependencies.onUnavailable?.(
      "trade-route price modifiers are not captured",
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
    const ratio = TRADE_RATIO[resourceId];
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
    const ratio = TRADE_RATIO[entry.id];
    if (ratio === undefined) return undefined;
    const prices = routePrices(root, resource, ratio);
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
