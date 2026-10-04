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
import type { CapturedGameMechanics } from "../../../../ports/captured-game-mechanics.ts";
import type { GameKeyStateReader } from "../../../../ports/game-key-state.ts";
import { finite, isRecord, readProperty } from "../../../validation.ts";
import {
  readCapturedTradeQuote,
  readCapturedRegionalVolume,
} from "./captured-trade-quote.ts";
import type {
  MarketBoard,
  MarketBoardSource,
} from "./captured-market-board.ts";
import { isCapturedRouteMultiplierNeutral } from "./captured-route-multiplier.ts";

interface CapturedTradeRoutesDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly board: MarketBoardSource;
  readonly mechanics: CapturedGameMechanics;
  readonly keyState: GameKeyStateReader;
  readonly readSettings: () => unknown;
  readonly readDemand?: () => {
    readonly isDemanded: (resourceId: string) => boolean;
    readonly storageRequired: (resourceId: string) => number;
  };
  readonly onUnavailable?: (reason: string) => void;
}

interface RouteSession {
  readonly root: unknown;
  readonly board: MarketBoard;
  readonly market: Record<PropertyKey, unknown>;
  readonly routeCounts: ReadonlyMap<string, number>;
  readonly controls: ReadonlyMap<string, GameControlHandle>;
  readonly marketRouteCount: number;
}

interface RegionalRouteSession {
  readonly root: unknown;
  readonly board: MarketBoard;
  readonly market: Record<PropertyKey, unknown>;
  readonly selectedZone: unknown;
  readonly expectedRoutes: Map<string, number>;
  readonly controls: ReadonlyMap<string, GameControlHandle>;
  readonly marketRouteCount: number;
}

interface RegionalRouteCapture {
  readonly input: Readonly<RegionalTradeRoutesInput>;
  readonly session: RegionalRouteSession;
}

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

function routeSettingsSnapshot(
  value: unknown,
  board: MarketBoard,
): Readonly<Record<string, unknown>> {
  const source = settingsRecord(value);
  const snapshot: Record<string, unknown> = {};
  for (const key of [
    "tradeRouteSellExcess",
    "tradeRouteMinimumMoneyPerSecond",
    "tradeRouteMinimumMoneyPercentage",
    "inflationChallengeAssist",
    "inflationChallengeSaveMinutes",
  ])
    snapshot[key] = source[key];
  for (const row of board.rows) {
    const id = row.elementId.slice(board.mode === "regional" ? 3 : 7);
    for (const prefix of [
      "res_buy_p_",
      "res_trade_buy_",
      "res_trade_sell_",
      "res_trade_w_",
      "res_trade_p_",
    ])
      snapshot[`${prefix}${id}`] = source[`${prefix}${id}`];
  }
  return Object.freeze(snapshot);
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
  board: MarketBoard,
):
  | { readonly input: TradeRoutesInput; readonly session: RouteSession }
  | undefined {
  const root = dependencies.rootState.readRoot();
  if (
    root === undefined ||
    board.mode !== "global" ||
    board.root !== root ||
    !dependencies.board.isCurrent(board)
  )
    return undefined;
  const cityMarket = readProperty(readProperty(root, "city"), "market");
  const resources = readProperty(root, "resource");
  const tech = readProperty(root, "tech");
  const currency = finite(readProperty(tech, "currency")) ?? 0;
  const money = readProperty(resources, "Money");
  if (!isRecord(cityMarket) || !isRecord(resources) || !isRecord(money))
    return undefined;
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

  const settings = routeSettingsSnapshot(dependencies.readSettings(), board);
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
  for (const [index, row] of board.rows.entries()) {
    const resourceId = row.elementId.slice("market-".length);
    const resource = readProperty(resources, resourceId);
    if (!isRecord(resource)) return undefined;
    if (!routeUnlocked(root, resourceId, resource)) continue;
    const trade = finite(resource["trade"]);
    if (trade === undefined || !Number.isSafeInteger(trade)) return undefined;
    const control = dependencies.controls.resolve(row.elementId);
    if (
      control === undefined ||
      control.generation !== row.generation ||
      !control.methods.includes("autoBuy") ||
      !control.methods.includes("autoSell") ||
      !control.methods.includes("zero") ||
      !control.methods.includes("aSell") ||
      !control.methods.includes("aBuy")
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
    const control = routeControls.get(entry.id);
    if (control === undefined) return undefined;
    const quote = readCapturedTradeQuote(
      root,
      entry.id,
      control,
      dependencies.rootState,
      dependencies.controls,
      dependencies.mechanics,
      () => dependencies.board.isCurrent(board),
    );
    if (!dependencies.board.isCurrent(board)) return undefined;
    const required = finite(demand.storageRequired(entry.id));
    if (
      amount === undefined ||
      maximumResource === undefined ||
      diff === undefined ||
      required === undefined ||
      quote === undefined ||
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
        tradeSellPrice: quote.sellPrice,
        tradeBuyPrice: quote.buyPrice,
        rateOfChange: diff,
        tradeRouteQuantity: quote.sellQuantity,
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
      board,
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
  board: MarketBoard,
): RegionalRouteCapture | undefined {
  const root = dependencies.rootState.readRoot();
  if (
    root === undefined ||
    board.mode !== "regional" ||
    board.root !== root ||
    !dependencies.board.isCurrent(board)
  )
    return undefined;
  const city = readProperty(root, "city");
  const market = readProperty(city, "market");
  const resources = readProperty(root, "resource");
  const race = readProperty(root, "race");
  const governor = readProperty(race, "governor");
  const config = readProperty(governor, "config");
  const trader = readProperty(config, "trader");
  if (!isRecord(market) || !isRecord(resources)) return undefined;

  const maximumRoutes = finite(market["mtrade"]);
  const usedRoutes = finite(market["trade"]);
  const money = finite(
    readProperty(readProperty(resources, "Money"), "amount"),
  );
  if (
    maximumRoutes === undefined ||
    !Number.isSafeInteger(maximumRoutes) ||
    maximumRoutes < 0 ||
    money === undefined ||
    usedRoutes === undefined ||
    !Number.isSafeInteger(usedRoutes)
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

  const resourceIds = board.rows.map((row) => row.elementId.slice(3));
  if (resourceIds.length === 0) return undefined;
  const volumes = new Map<string, number>();
  const controls = new Map<string, GameControlHandle>();
  for (const resourceId of resourceIds) {
    const row = board.rows.find(
      (entry) => entry.elementId === `bm-${resourceId}`,
    );
    const control = dependencies.controls.resolve(`bm-${resourceId}`);
    if (
      control === undefined ||
      row === undefined ||
      control.generation !== row.generation ||
      !control.methods.includes("volume") ||
      !control.methods.includes("more") ||
      !control.methods.includes("less")
    )
      return undefined;
    const volume = readCapturedRegionalVolume(
      root,
      resourceId,
      control,
      dependencies.rootState,
      dependencies.controls,
      dependencies.mechanics,
      () => dependencies.board.isCurrent(board),
    );
    if (volume === undefined || !dependencies.board.isCurrent(board))
      return undefined;
    volumes.set(resourceId, volume);
    controls.set(resourceId, control);
  }
  const candidates: RegionalTradeResourceInput[] = [];
  for (const resourceId of resourceIds) {
    const resource = readProperty(resources, resourceId);
    if (!isRecord(resource) || resource["display"] !== true) return undefined;
    const diffLedger = readProperty(resource, "regDiff");
    // `supply.js:regDiff` lazily creates this ledger and returns an empty object before the
    // regional reckoning has written its first rate. Preserve that lenient upstream state.
    if (diffLedger === undefined) continue;
    if (!isRecord(diffLedger)) return undefined;
    for (const pool of Object.keys(diffLedger)) poolNames.add(pool);
  }
  if (poolNames.size === 0) return undefined;

  for (const pool of poolNames) {
    for (const [resourceId, volume] of volumes) {
      const resource = readProperty(resources, resourceId);
      if (!isRecord(resource) || resource["display"] !== true) return undefined;
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
    const control = controls.get(candidate.resourceId);
    if (
      control === undefined ||
      !control.methods.includes("more") ||
      !control.methods.includes("less")
    ) {
      return undefined;
    }
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
      board,
      market,
      selectedZone: market["bmZone"],
      expectedRoutes,
      controls,
      marketRouteCount: usedRoutes,
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

  const market = captured.session.market;
  let ownedZone = captured.session.selectedZone;
  let expectedTotal = captured.session.marketRouteCount;
  try {
    for (const operation of result.operations) {
      const control = captured.session.controls.get(operation.resourceId);
      if (control === undefined) return;
      for (let index = 0; index < operation.count; index += 1) {
        if (
          dependencies.rootState.readRoot() !== captured.session.root ||
          !dependencies.board.isCurrent(captured.session.board) ||
          !isCapturedRouteMultiplierNeutral({
            root: captured.session.root,
            boards: dependencies.board,
            board: captured.session.board,
            controls: dependencies.controls,
            keyState: dependencies.keyState,
          }) ||
          readProperty(
            readProperty(captured.session.root, "city"),
            "market",
          ) !== market ||
          market["bmZone"] !== ownedZone
        )
          return;
        if (
          dependencies.controls.resolve(control.elementId)?.generation !==
            control.generation ||
          !control.methods.includes("volume") ||
          !control.methods.includes("more") ||
          !control.methods.includes("less")
        )
          return;
        const key = `${operation.pool}\u0000${operation.resourceId}`;
        const expected = captured.session.expectedRoutes.get(key) ?? 0;
        const actual = regionalPoolRoute(
          isRecord(market["bm"]) ? market["bm"] : {},
          operation.pool,
          operation.resourceId,
        );
        if (actual !== expected || finite(market["trade"]) !== expectedTotal)
          return;
        market["bmZone"] = operation.pool;
        ownedZone = operation.pool;
        if (market["bmZone"] !== ownedZone) return;
        const method = operation.kind === "add" ? "more" : "less";
        const invoked = dependencies.controls.invoke(control, method);
        if (!invoked.ok) return;
        const next = regionalPoolRoute(
          isRecord(market["bm"]) ? market["bm"] : {},
          operation.pool,
          operation.resourceId,
        );
        const expectedNext = expected + (operation.kind === "add" ? 1 : -1);
        const nextTotal = expectedTotal + (operation.kind === "add" ? 1 : -1);
        if (
          dependencies.rootState.readRoot() !== captured.session.root ||
          !dependencies.board.isCurrent(captured.session.board) ||
          market["bmZone"] !== ownedZone ||
          next !== expectedNext ||
          finite(market["trade"]) !== nextTotal
        )
          return;
        captured.session.expectedRoutes.set(key, expectedNext);
        expectedTotal = nextTotal;
      }
    }
  } finally {
    if (
      dependencies.rootState.readRoot() === captured.session.root &&
      readProperty(readProperty(captured.session.root, "city"), "market") ===
        market &&
      market["bmZone"] === ownedZone
    )
      market["bmZone"] = captured.session.selectedZone;
  }
}

export function createCapturedTradeRoutes(
  dependencies: CapturedTradeRoutesDependencies,
): TradeRouteAdjuster {
  return Object.freeze({
    adjust(): void {
      const board = dependencies.board.current();
      if (board === undefined) return;
      if (board.mode === "regional") {
        const regional = readRegionalRouteInput(dependencies, board);
        applyRegionalTradeRoutes(dependencies, regional);
        return;
      }
      const captured = readRouteInput(dependencies, board);
      if (captured === undefined) return;
      const result = planTradeRoutes(captured.input);
      if (
        dependencies.rootState.readRoot() !== captured.session.root ||
        !dependencies.board.isCurrent(board)
      )
        return;
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
        const control = captured.session.controls.get(resourceId);
        if (
          control === undefined ||
          dependencies.controls.resolve(control.elementId)?.generation !==
            control.generation ||
          !control.methods.includes("aSell") ||
          !control.methods.includes("aBuy")
        )
          return;
      }

      const expected = new Map(captured.session.routeCounts);
      let expectedTotal = captured.session.marketRouteCount;
      for (const operation of result.operations) {
        const control = captured.session.controls.get(operation.resourceId);
        if (control === undefined) return;
        const method =
          operation.kind === "zero"
            ? "zero"
            : operation.kind === "add"
              ? "autoBuy"
              : "autoSell";
        const count = operation.kind === "zero" ? 1 : operation.count;
        for (let index = 0; index < count; index += 1) {
          const resource = readProperty(
            readProperty(captured.session.root, "resource"),
            operation.resourceId,
          );
          const before = expected.get(operation.resourceId);
          if (
            dependencies.rootState.readRoot() !== captured.session.root ||
            !dependencies.board.isCurrent(board) ||
            readProperty(
              readProperty(captured.session.root, "city"),
              "market",
            ) !== captured.session.market ||
            !isRecord(resource) ||
            before === undefined ||
            finite(resource["trade"]) !== before ||
            finite(captured.session.market["trade"]) !== expectedTotal ||
            dependencies.controls.resolve(control.elementId)?.generation !==
              control.generation
          )
            return;
          const invoked = dependencies.controls.invoke(control, method, [
            operation.resourceId,
            1,
          ]);
          if (!invoked.ok) return;
          const after =
            operation.kind === "zero"
              ? 0
              : before + (operation.kind === "add" ? 1 : -1);
          const totalAfter =
            operation.kind === "zero"
              ? expectedTotal - Math.abs(before)
              : expectedTotal + (Math.abs(after) - Math.abs(before));
          if (
            dependencies.rootState.readRoot() !== captured.session.root ||
            !dependencies.board.isCurrent(board) ||
            readProperty(
              readProperty(captured.session.root, "city"),
              "market",
            ) !== captured.session.market ||
            readProperty(
              readProperty(captured.session.root, "resource"),
              operation.resourceId,
            ) !== resource ||
            finite(resource["trade"]) !== after ||
            finite(captured.session.market["trade"]) !== totalAfter
          )
            return;
          expected.set(operation.resourceId, after);
          expectedTotal = totalAfter;
        }
      }
      // The game recomputes Money.diff during the next period. The old manager's writeback is not
      // valid on DeadSpace, whose resource record owns that derived value.
    },
  });
}
