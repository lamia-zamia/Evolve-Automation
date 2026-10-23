import { planTradeRoutes } from "../../../../domain/economy/market/trade-routes.ts";
import { readCapturedInflationSaveMoney } from "../resources/captured-inflation-assist.ts";
import {
  planRegionalTradeRoutes,
  type RegionalTradeResourceInput,
  type RegionalTradeRoutesInput,
} from "../../../../domain/economy/market/regional-trade-routes.ts";
import type {
  TradeResourceView,
  TradeOperation,
  TradeRoutesResult,
  TradeRoutesInput,
} from "../../../../domain/economy/market/trade-routes.ts";
import type { TradeRouteAdjuster } from "../../../../ports/market.ts";
import type { GameControlHandle } from "../../../../ports/game-control-registry.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { CapturedGameMechanics } from "../../../../ports/captured-game-mechanics.ts";
import type { GameKeyboardState } from "../../../../ports/game-key-state.ts";
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

declare const __EA_TEST_SURFACE_ENABLED__: boolean;

const MARKET_ROUTE_BATCH_SIZE = 100;

interface CapturedTradeRoutesTestSurface {
  readonly allowHistoricalSignalForComparisonTest?: () => boolean;
  readonly demandForTest?: (
    input: Readonly<TradeRoutesInput>,
    context: Readonly<{
      readonly rootCurrent: boolean;
      readonly rootGeneration: number;
      readonly progressionEpoch: string;
      readonly boardCurrent: boolean;
      readonly controls: readonly Readonly<{
        readonly elementId: string;
        readonly generation: number;
        readonly methods: readonly string[];
      }>[];
      readonly routeCount: number;
      readonly maximumRoutes: number;
      readonly ownerEnabled: boolean;
      readonly resources: readonly CapturedTradeRouteObservation[];
    }>,
  ) => unknown;
  readonly preserveMoneyFloorForDemandTest?: () => boolean;
  readonly nowForTest?: () => number;
  readonly resolveOperations?: (
    input: Readonly<TradeRoutesInput>,
    planned: Readonly<TradeRoutesResult>,
    context: Readonly<{
      readonly rootCurrent: boolean;
      readonly rootGeneration: number;
      readonly progressionEpoch: string;
      readonly boardCurrent: boolean;
      readonly controls: readonly Readonly<{
        readonly elementId: string;
        readonly generation: number;
      }>[];
      readonly routeCount: number;
      readonly maximumRoutes: number;
      readonly ownerEnabled: boolean;
      readonly resources: readonly CapturedTradeRouteObservation[];
    }>,
  ) => unknown;
  readonly onTrace?: (event: Readonly<Record<string, unknown>>) => void;
}

interface CapturedTradeRoutesDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly board: MarketBoardSource;
  readonly mechanics: CapturedGameMechanics;
  readonly keyState: GameKeyboardState;
  readonly readSettings: () => unknown;
  readonly readRootGeneration?: () => number;
  readonly readProgressionEpoch?: () => string;
  readonly readDemand?: () => {
    readonly isDemanded: (resourceId: string) => boolean;
    readonly storageRequired: (resourceId: string) => number;
    readonly requestedQuantity?: (resourceId: string) => number;
  };
  readonly onUnavailable?: (reason: string) => void;
  readonly testSurface?: CapturedTradeRoutesTestSurface;
}

function normalizeCapturedTradeRouteOverride(
  value: unknown,
  input: Readonly<TradeRoutesInput>,
  context: Readonly<{
    readonly ownerEnabled: boolean;
    readonly routeCount: number;
    readonly maximumRoutes: number;
  }>,
): readonly TradeOperation[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const operations: TradeOperation[] = [];
  const addedByResource = new Map<string, number>();
  let totalAdded = 0;
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry["resourceId"] !== "string")
      return undefined;
    const resource = input.priorityList.find(
      ({ id }) => id === entry["resourceId"],
    );
    if (resource === undefined) return undefined;
    if (entry["kind"] === "zero") {
      operations.push({ kind: "zero", resourceId: resource.id });
      continue;
    }
    if (
      (entry["kind"] !== "add" && entry["kind"] !== "remove") ||
      typeof entry["count"] !== "number" ||
      !Number.isSafeInteger(entry["count"]) ||
      entry["count"] < 1 ||
      (entry["kind"] === "add" &&
        (!context.ownerEnabled ||
          !resource.autoTradeBuyEnabled ||
          !resource.isDemanded ||
          resource.usefulRatio >= 1 ||
          resource.tradeRoutes < 0 ||
          resource.tradeRoutes +
            (addedByResource.get(resource.id) ?? 0) +
            entry["count"] >
            input.importRouteCap ||
          context.routeCount + totalAdded + entry["count"] >
            context.maximumRoutes))
    )
      return undefined;
    if (entry["kind"] === "add") {
      totalAdded += entry["count"];
      addedByResource.set(
        resource.id,
        (addedByResource.get(resource.id) ?? 0) + entry["count"],
      );
    }
    operations.push({
      kind: entry["kind"],
      resourceId: resource.id,
      count: entry["count"],
    });
  }
  return Object.freeze(operations.map((operation) => Object.freeze(operation)));
}

interface RouteSession {
  readonly root: unknown;
  readonly board: MarketBoard;
  readonly market: Record<PropertyKey, unknown>;
  readonly resourceContainer: Record<PropertyKey, unknown>;
  readonly resources: ReadonlyMap<string, Record<PropertyKey, unknown>>;
  readonly ownerEnabled: boolean;
  readonly routeCounts: ReadonlyMap<string, number>;
  readonly controls: ReadonlyMap<string, GameControlHandle>;
  readonly marketRouteCount: number;
}

interface CapturedTradeRouteObservation {
  readonly resourceId: string;
  readonly holding: number;
  readonly capacity: number;
  readonly netRatePerPeriod: number;
  readonly storageRequiredQuantity: number;
  readonly currentRoutes: number;
  readonly maximumRoutes: number;
  readonly importPricePerPeriod: number;
  readonly importQuantityPerPeriod: number;
  readonly importsEnabled: boolean;
  readonly exportsEnabled: boolean;
  readonly demanded: boolean;
  readonly requestedQuantity: number | undefined;
  readonly controlElementId: string;
  readonly controlGeneration: number;
}

interface CapturedGoalDemandSignalForTest {
  readonly status: "signal";
  readonly rootGeneration: number;
  readonly progressionEpoch: string;
  readonly goalId: string;
  readonly goalActionId: string;
  readonly selectedActionId: string;
  readonly selectedOfferGeneration: number;
  readonly selectedPrestige: string;
  readonly researchPermission: true;
  readonly triggersEnabled: false;
  readonly offerObservationId: string;
  readonly offerSetIdentity: string;
  readonly grantTechnology: string;
  readonly grantLevel: number;
  readonly grantLevelBefore: number;
  readonly researchPrice: Readonly<Record<string, number>>;
  readonly selectedApplicabilityStatus: string;
  readonly goalRelationship: string;
  readonly goalChainIdentity: string;
  readonly resourceId: string;
  readonly targetQuantity: number;
  readonly shortfall: number;
}

interface CapturedHistoricalGoalDemandSignalForTest {
  readonly status: "signal";
  readonly rootGeneration: number;
  readonly progressionEpoch: string;
  readonly goalId: string;
  readonly goalActionId: string;
  readonly selectedActionId: string;
  readonly selectedOfferGeneration: number;
  readonly resourceId: string;
  readonly targetQuantity: number;
  readonly shortfall: number;
}

function isCapturedGoalDemandSignalForTest(
  value: unknown,
  rootGeneration: number,
  progressionEpoch: string,
): value is CapturedGoalDemandSignalForTest {
  return (
    isRecord(value) &&
    value["status"] === "signal" &&
    value["rootGeneration"] === rootGeneration &&
    value["progressionEpoch"] === progressionEpoch &&
    typeof value["goalId"] === "string" &&
    typeof value["goalActionId"] === "string" &&
    typeof value["selectedActionId"] === "string" &&
    Number.isSafeInteger(value["selectedOfferGeneration"]) &&
    typeof value["selectedPrestige"] === "string" &&
    value["goalId"] === `prestige:${value["selectedPrestige"]}` &&
    value["researchPermission"] === true &&
    value["triggersEnabled"] === false &&
    typeof value["offerObservationId"] === "string" &&
    typeof value["offerSetIdentity"] === "string" &&
    typeof value["grantTechnology"] === "string" &&
    Number.isSafeInteger(value["grantLevel"]) &&
    Number.isSafeInteger(value["grantLevelBefore"]) &&
    isRecord(value["researchPrice"]) &&
    Object.values(value["researchPrice"]).every(
      (amount) => typeof amount === "number" && Number.isFinite(amount),
    ) &&
    typeof value["selectedApplicabilityStatus"] === "string" &&
    typeof value["goalRelationship"] === "string" &&
    typeof value["goalChainIdentity"] === "string" &&
    typeof value["resourceId"] === "string" &&
    typeof value["targetQuantity"] === "number" &&
    Number.isFinite(value["targetQuantity"]) &&
    value["targetQuantity"] >= 0 &&
    typeof value["shortfall"] === "number" &&
    Number.isFinite(value["shortfall"]) &&
    value["shortfall"] > 0
  );
}

function isCapturedHistoricalGoalDemandSignalForComparisonTest(
  value: unknown,
  rootGeneration: number,
  progressionEpoch: string,
): value is CapturedHistoricalGoalDemandSignalForTest {
  // Stage 4A/4B used this smaller test signal; retain it only for F/G controls.
  return (
    isRecord(value) &&
    value["status"] === "signal" &&
    value["rootGeneration"] === rootGeneration &&
    value["progressionEpoch"] === progressionEpoch &&
    typeof value["goalId"] === "string" &&
    value["goalId"].length > 0 &&
    typeof value["goalActionId"] === "string" &&
    typeof value["selectedActionId"] === "string" &&
    Number.isSafeInteger(value["selectedOfferGeneration"]) &&
    typeof value["resourceId"] === "string" &&
    typeof value["targetQuantity"] === "number" &&
    Number.isFinite(value["targetQuantity"]) &&
    value["targetQuantity"] > 0 &&
    typeof value["shortfall"] === "number" &&
    Number.isFinite(value["shortfall"]) &&
    value["shortfall"] > 0 &&
    value["shortfall"] <= value["targetQuantity"]
  );
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
  onUnavailable?: (reason: string) => void,
):
  | {
      readonly input: TradeRoutesInput;
      readonly session: RouteSession;
      readonly observations: readonly CapturedTradeRouteObservation[];
    }
  | undefined {
  const unavailable = (reason: string) => {
    onUnavailable?.(reason);
    return undefined;
  };
  const root = dependencies.rootState.readRoot();
  if (
    root === undefined ||
    board.mode !== "global" ||
    board.root !== root ||
    !dependencies.board.isCurrent(board)
  )
    return unavailable("root-or-board-stale");
  const cityMarket = readProperty(readProperty(root, "city"), "market");
  const resources = readProperty(root, "resource");
  const tech = readProperty(root, "tech");
  const currency = finite(readProperty(tech, "currency")) ?? 0;
  const money = readProperty(resources, "Money");
  if (!isRecord(cityMarket) || !isRecord(resources) || !isRecord(money))
    return unavailable("market-resource-or-money-record-missing");
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
    return unavailable("invalid-market-route-or-money-sample");
  }

  const currentSettings = settingsRecord(dependencies.readSettings());
  const settings = routeSettingsSnapshot(currentSettings, board);
  const demand = dependencies.readDemand?.() ?? {
    isDemanded: () => false,
    storageRequired: () => 1,
  };
  const routeCounts = new Map<string, number>();
  const routeControls = new Map<string, GameControlHandle>();
  const routeResources = new Map<string, Record<PropertyKey, unknown>>();
  const priority: {
    readonly id: string;
    readonly index: number;
    readonly value: number;
  }[] = [];
  for (const [index, row] of board.rows.entries()) {
    const resourceId = row.elementId.slice("market-".length);
    const resource = readProperty(resources, resourceId);
    if (!isRecord(resource))
      return unavailable(`resource-record-missing:${resourceId}`);
    if (!routeUnlocked(root, resourceId, resource)) continue;
    const trade = finite(resource["trade"]);
    if (trade === undefined || !Number.isSafeInteger(trade))
      return unavailable(`invalid-route-count:${resourceId}`);
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
      return unavailable(`invalid-control:${resourceId}`);
    }
    const marketPriority =
      finite(settings[`res_buy_p_${resourceId}`]) ?? Number.MAX_SAFE_INTEGER;
    priority.push({ id: resourceId, index, value: marketPriority });
    routeCounts.set(resourceId, trade);
    routeControls.set(resourceId, control);
    routeResources.set(resourceId, resource);
  }
  priority.sort(
    (left, right) => left.value - right.value || left.index - right.index,
  );

  const views: TradeResourceView[] = [];
  const observations: CapturedTradeRouteObservation[] = [];
  let unmanaged = 0;
  for (const entry of priority) {
    const resource = readProperty(resources, entry.id);
    if (!isRecord(resource))
      return unavailable(`resource-record-missing:${entry.id}`);
    const amount = finite(resource["amount"]);
    const maximumResource = finite(resource["max"]);
    const diff = finite(resource["diff"]);
    const control = routeControls.get(entry.id);
    if (control === undefined)
      return unavailable(`control-missing:${entry.id}`);
    const quote = readCapturedTradeQuote(
      root,
      entry.id,
      control,
      dependencies.rootState,
      dependencies.controls,
      dependencies.mechanics,
      () => dependencies.board.isCurrent(board),
    );
    if (!dependencies.board.isCurrent(board))
      return unavailable(`board-stale-after-quote:${entry.id}`);
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
      return unavailable(
        amount === undefined
          ? `amount-missing:${entry.id}`
          : maximumResource === undefined
            ? `capacity-missing:${entry.id}`
            : diff === undefined
              ? `rate-missing:${entry.id}`
              : required === undefined || required <= 0
                ? `demand-storage-missing:${entry.id}`
                : quote === undefined
                  ? `native-quote-unavailable:${entry.id}`
                  : `invalid-resource-observation:${entry.id}`,
      );
    }
    const storageRatio = maximumResource > 0 ? amount / maximumResource : 1;
    const usefulRatio =
      maximumResource > 0 ? amount / Math.min(maximumResource, required) : 1;
    const buyEnabled = settings[`res_trade_buy_${entry.id}`] === true;
    const sellEnabled = settings[`res_trade_sell_${entry.id}`] === true;
    if (
      typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
      __EA_TEST_SURFACE_ENABLED__ === true
    )
      observations.push(
        Object.freeze({
          resourceId: entry.id,
          holding: amount,
          capacity: maximumResource,
          netRatePerPeriod: diff,
          storageRequiredQuantity: required,
          currentRoutes: routeCounts.get(entry.id) ?? 0,
          maximumRoutes: currency >= 6 ? 1_000_000 : currency >= 4 ? 100 : 25,
          importPricePerPeriod: quote.buyPrice,
          importQuantityPerPeriod: quote.buyVolume,
          importsEnabled: buyEnabled,
          exportsEnabled: sellEnabled,
          demanded: demand.isDemanded(entry.id),
          requestedQuantity: demand.requestedQuantity?.(entry.id),
          controlElementId: control.elementId,
          controlGeneration: control.generation,
        }),
      );
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
    observations: Object.freeze(observations),
    session: Object.freeze({
      root,
      board,
      market: cityMarket,
      resourceContainer: resources,
      resources: routeResources,
      ownerEnabled: currentSettings["autoMarket"] === true,
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
      const testSurface =
        typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
        __EA_TEST_SURFACE_ENABLED__ === true
          ? dependencies.testSurface
          : undefined;
      if (board === undefined) {
        testSurface?.onTrace?.({
          kind: "skipped",
          reason: "board-unavailable",
        });
        return;
      }
      if (board.mode === "regional") {
        const regional = readRegionalRouteInput(dependencies, board);
        applyRegionalTradeRoutes(dependencies, regional);
        return;
      }
      const captured = readRouteInput(dependencies, board, (reason) =>
        testSurface?.onTrace?.({ kind: "capture-unavailable", reason }),
      );
      if (captured === undefined) {
        testSurface?.onTrace?.({
          kind: "skipped",
          reason: "capture-unavailable",
        });
        return;
      }
      const controls = [...captured.session.controls.values()].map(
        ({ elementId, generation, methods }) =>
          Object.freeze({ elementId, generation, methods }),
      );
      const testContext = Object.freeze({
        rootCurrent:
          dependencies.rootState.readRoot() === captured.session.root,
        rootGeneration: dependencies.readRootGeneration?.() ?? -1,
        progressionEpoch: dependencies.readProgressionEpoch?.() ?? "",
        boardCurrent: dependencies.board.isCurrent(board),
        controls: Object.freeze(controls),
        routeCount: captured.session.marketRouteCount,
        maximumRoutes: captured.input.maxTradeRoutes,
        ownerEnabled: captured.session.ownerEnabled,
        resources: captured.observations,
      });
      let requestedTestDemand:
        | CapturedGoalDemandSignalForTest
        | CapturedHistoricalGoalDemandSignalForTest
        | undefined;
      let authoritativeTestDemand: CapturedGoalDemandSignalForTest | undefined;
      if (
        typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
        __EA_TEST_SURFACE_ENABLED__ === true &&
        testContext.ownerEnabled &&
        testContext.rootCurrent &&
        testContext.boardCurrent
      ) {
        const proposedTestDemand = testSurface?.demandForTest?.(
          captured.input,
          testContext,
        );
        const validatedTestDemand = isCapturedGoalDemandSignalForTest(
          proposedTestDemand,
          testContext.rootGeneration,
          testContext.progressionEpoch,
        )
          ? proposedTestDemand
          : undefined;
        const historicalComparisonEnabled =
          testSurface?.allowHistoricalSignalForComparisonTest?.() === true;
        const validatedHistoricalDemand =
          validatedTestDemand === undefined && historicalComparisonEnabled
            ? isCapturedHistoricalGoalDemandSignalForComparisonTest(
                proposedTestDemand,
                testContext.rootGeneration,
                testContext.progressionEpoch,
              )
              ? proposedTestDemand
              : undefined
            : undefined;
        const acceptedDemand = validatedTestDemand ?? validatedHistoricalDemand;
        authoritativeTestDemand = validatedTestDemand;
        requestedTestDemand =
          acceptedDemand === undefined
            ? undefined
            : Object.freeze({ ...acceptedDemand });
      }
      const testDemandResource =
        requestedTestDemand !== undefined
          ? captured.input.priorityList.find(
              (resource) => resource.id === requestedTestDemand["resourceId"],
            )
          : undefined;
      const testDemandObservation =
        requestedTestDemand !== undefined
          ? captured.observations.find(
              (resource) =>
                resource.resourceId === requestedTestDemand["resourceId"],
            )
          : undefined;
      const testDemandControl =
        requestedTestDemand !== undefined &&
        typeof requestedTestDemand["resourceId"] === "string"
          ? captured.session.controls.get(requestedTestDemand["resourceId"])
          : undefined;
      const researchControl =
        requestedTestDemand === undefined
          ? undefined
          : dependencies.controls.resolve(
              requestedTestDemand["selectedActionId"],
            );
      const testDemandAccepted =
        requestedTestDemand !== undefined &&
        testDemandResource !== undefined &&
        testDemandObservation !== undefined &&
        testDemandControl !== undefined &&
        researchControl?.generation ===
          requestedTestDemand["selectedOfferGeneration"] &&
        testDemandObservation.holding < requestedTestDemand["targetQuantity"] &&
        testDemandObservation.capacity >=
          requestedTestDemand["targetQuantity"] &&
        requestedTestDemand["shortfall"] ===
          requestedTestDemand["targetQuantity"] -
            testDemandObservation.holding &&
        (testDemandObservation.requestedQuantity === undefined ||
          testDemandObservation.requestedQuantity <
            requestedTestDemand["targetQuantity"]) &&
        testDemandObservation.importPricePerPeriod > 0 &&
        testDemandObservation.importQuantityPerPeriod > 0 &&
        testDemandResource.autoTradeBuyEnabled &&
        !testDemandResource.isDemanded &&
        testDemandControl.generation ===
          testDemandObservation.controlGeneration &&
        testDemandControl.methods.includes("autoBuy");
      const plannerInput = testDemandAccepted
        ? Object.freeze({
            ...captured.input,
            priorityList: Object.freeze(
              captured.input.priorityList.map((resource) =>
                resource.id === requestedTestDemand?.["resourceId"]
                  ? Object.freeze({ ...resource, isDemanded: true })
                  : resource,
              ),
            ),
          })
        : captured.input;
      const baselineResult = testDemandAccepted
        ? planTradeRoutes(captured.input)
        : undefined;
      const preserveMoneyFloorForDemand =
        testDemandAccepted === true &&
        typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
        __EA_TEST_SURFACE_ENABLED__ === true &&
        testSurface?.preserveMoneyFloorForDemandTest?.() === true;
      const result = testDemandAccepted
        ? planTradeRoutes(
            plannerInput,
            preserveMoneyFloorForDemand
              ? { preserveMoneyFloorForDemandedResources: true }
              : undefined,
          )
        : planTradeRoutes(captured.input);
      let operations = result.operations;
      if (
        typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
        __EA_TEST_SURFACE_ENABLED__ === true
      ) {
        const testOperations =
          testContext.ownerEnabled &&
          testContext.rootCurrent &&
          testContext.boardCurrent
            ? testSurface?.resolveOperations?.(
                plannerInput,
                result,
                testContext,
              )
            : undefined;
        operations =
          normalizeCapturedTradeRouteOverride(
            testOperations,
            plannerInput,
            testContext,
          ) ?? result.operations;
      }
      testSurface?.onTrace?.({
        kind: "plan",
        rootCurrent:
          dependencies.rootState.readRoot() === captured.session.root,
        boardCurrent: dependencies.board.isCurrent(board),
        desiredOperations: operations,
        baselineOperations: baselineResult?.operations ?? result.operations,
        plannerOperations: result.operations,
        testDemandResourceId: testDemandAccepted
          ? requestedTestDemand?.["resourceId"]
          : undefined,
        testDemandMoneyFloorPolicy: testDemandAccepted
          ? preserveMoneyFloorForDemand
            ? "preserve-configured-floor"
            : "demand-can-relax-floor"
          : "ordinary-market",
        routeCount: captured.session.marketRouteCount,
        maximumRoutes: captured.input.maxTradeRoutes,
        moneyRate: captured.input.money.rateOfChange,
        moneyHolding: captured.input.money.currentQuantity,
        moneyFloor: plannerInput.settings,
        pricesAndPriorities: plannerInput.priorityList.map((resource) => ({
          resourceId: resource.id,
          routes: resource.tradeRoutes,
          importEnabled: resource.autoTradeBuyEnabled,
          exportEnabled: resource.autoTradeSellEnabled,
          demanded: resource.isDemanded,
          storageRatio: resource.storageRatio,
          usefulRatio: resource.usefulRatio,
          importPrice: resource.tradeBuyPrice,
          importQuantity: resource.tradeRouteQuantity,
          exportPrice: resource.tradeSellPrice,
          priority: resource.autoTradePriority,
          weighting: resource.autoTradeWeighting,
        })),
        resources: captured.observations,
        resourceRoutes: controls.map(({ elementId, generation }) => ({
          elementId,
          generation,
          routes: captured.session.routeCounts.get(
            elementId.slice("market-".length),
          ),
        })),
      });
      if (
        dependencies.rootState.readRoot() !== captured.session.root ||
        !dependencies.board.isCurrent(board)
      ) {
        testSurface?.onTrace?.({
          kind: "skipped",
          reason: "root-or-board-stale",
        });
        return;
      }
      const current = readProperty(
        readProperty(captured.session.root, "city"),
        "market",
      );
      if (
        !isRecord(current) ||
        current !== captured.session.market ||
        finite(current["trade"]) !== captured.session.marketRouteCount
      ) {
        testSurface?.onTrace?.({
          kind: "skipped",
          reason: "market-route-count-stale",
        });
        return;
      }
      for (const [resourceId, routes] of captured.session.routeCounts) {
        const resource = readProperty(
          readProperty(captured.session.root, "resource"),
          resourceId,
        );
        if (!isRecord(resource) || finite(resource["trade"]) !== routes) {
          testSurface?.onTrace?.({
            kind: "skipped",
            reason: "resource-route-count-stale",
          });
          return;
        }
        const control = captured.session.controls.get(resourceId);
        if (
          control === undefined ||
          dependencies.controls.resolve(control.elementId)?.generation !==
            control.generation ||
          !control.methods.includes("aSell") ||
          !control.methods.includes("aBuy")
        ) {
          testSurface?.onTrace?.({
            kind: "skipped",
            reason: "route-control-stale",
          });
          return;
        }
      }

      if (
        typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
        __EA_TEST_SURFACE_ENABLED__ === true &&
        testDemandAccepted &&
        authoritativeTestDemand !== undefined
      ) {
        const researchFenceStartedAt = testSurface?.nowForTest?.();
        const evidence = authoritativeTestDemand;
        const currentSettings = settingsRecord(dependencies.readSettings());
        const currentBoard = dependencies.board.current();
        const currentResearch = dependencies.controls.resolve(
          evidence.selectedActionId,
        );
        const currentCapture =
          currentBoard === undefined
            ? undefined
            : readRouteInput(dependencies, currentBoard);
        const currentObservation = currentCapture?.observations.find(
          (entry) => entry.resourceId === evidence.resourceId,
        );
        const priorObservation = captured.observations.find(
          (entry) => entry.resourceId === evidence.resourceId,
        );
        let staleReason: string | undefined;
        if (
          dependencies.rootState.readRoot() !== captured.session.root ||
          (dependencies.readRootGeneration?.() ?? -1) !==
            evidence.rootGeneration ||
          (dependencies.readProgressionEpoch?.() ?? "") !==
            evidence.progressionEpoch
        ) {
          staleReason = "research-root-or-progression-stale";
        } else if (
          currentResearch?.generation !== evidence.selectedOfferGeneration
        ) {
          staleReason = "research-binding-generation-stale";
        } else if (
          currentSettings["prestigeType"] !== evidence.selectedPrestige ||
          currentSettings["autoResearch"] !== evidence.researchPermission ||
          currentSettings["autoTrigger"] !== evidence.triggersEnabled
        ) {
          staleReason = "research-permission-or-prestige-stale";
        } else if (
          currentBoard !== board ||
          currentCapture === undefined ||
          currentCapture.session.root !== captured.session.root ||
          currentCapture.session.market !== captured.session.market ||
          !currentCapture.session.ownerEnabled ||
          currentCapture.session.marketRouteCount !==
            captured.session.marketRouteCount ||
          currentCapture.input.maxTradeRoutes !==
            captured.input.maxTradeRoutes ||
          currentObservation === undefined ||
          priorObservation === undefined ||
          !currentObservation.importsEnabled ||
          currentCapture.input.priorityList.find(
            (resource) => resource.id === evidence.resourceId,
          )?.autoTradeBuyEnabled !== true
        ) {
          staleReason = "market-authority-stale";
        } else if (
          currentObservation.holding !== priorObservation.holding ||
          currentObservation.capacity !== priorObservation.capacity ||
          currentObservation.currentRoutes !== priorObservation.currentRoutes ||
          currentObservation.importPricePerPeriod !==
            priorObservation.importPricePerPeriod ||
          currentObservation.importQuantityPerPeriod !==
            priorObservation.importQuantityPerPeriod ||
          currentObservation.controlGeneration !==
            priorObservation.controlGeneration ||
          [...captured.session.routeCounts].some(
            ([resourceId, routes]) =>
              currentCapture.session.routeCounts.get(resourceId) !== routes,
          )
        ) {
          staleReason = "market-resource-or-quote-stale";
        }
        if (staleReason !== undefined) {
          testSurface?.onTrace?.({
            kind: "skipped",
            reason: staleReason,
            evidence: Object.freeze({
              goalId: evidence.goalId,
              goalActionId: evidence.goalActionId,
              selectedActionId: evidence.selectedActionId,
              selectedOfferGeneration: evidence.selectedOfferGeneration,
              resourceId: evidence.resourceId,
            }),
          });
          const endedAt = testSurface?.nowForTest?.();
          testSurface?.onTrace?.({
            kind: "research-final-fence",
            outcome: "rejected",
            durationMs:
              researchFenceStartedAt !== undefined && endedAt !== undefined
                ? endedAt - researchFenceStartedAt
                : undefined,
          });
          return;
        }
        const endedAt = testSurface?.nowForTest?.();
        testSurface?.onTrace?.({
          kind: "research-final-fence",
          outcome: "accepted",
          durationMs:
            researchFenceStartedAt !== undefined && endedAt !== undefined
              ? endedAt - researchFenceStartedAt
              : undefined,
        });
      }

      const expected = new Map(captured.session.routeCounts);
      let expectedTotal = captured.session.marketRouteCount;
      for (const operation of operations) {
        const control = captured.session.controls.get(operation.resourceId);
        if (control === undefined) {
          testSurface?.onTrace?.({
            kind: "skipped",
            reason: "operation-control-missing",
            operation,
          });
          return;
        }
        const method =
          operation.kind === "zero"
            ? "zero"
            : operation.kind === "add"
              ? "autoBuy"
              : "autoSell";
        let remaining = operation.kind === "zero" ? 1 : operation.count;
        while (remaining > 0) {
          const count =
            operation.kind === "zero"
              ? 1
              : Math.min(MARKET_ROUTE_BATCH_SIZE, remaining);
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
            readProperty(captured.session.root, "resource") !==
              captured.session.resourceContainer ||
            resource !== captured.session.resources.get(operation.resourceId) ||
            !isRecord(resource) ||
            before === undefined ||
            finite(resource["trade"]) !== before ||
            finite(captured.session.market["trade"]) !== expectedTotal ||
            dependencies.controls.resolve(control.elementId)?.generation !==
              control.generation
          ) {
            testSurface?.onTrace?.({
              kind: "skipped",
              reason: "operation-fence-stale",
              operation,
            });
            return;
          }
          const invoked = dependencies.controls.invoke(
            control,
            method,
            operation.kind === "zero"
              ? [operation.resourceId]
              : [operation.resourceId, count],
          );
          if (!invoked.ok) {
            testSurface?.onTrace?.({
              kind: "refused",
              reason: invoked.reason,
              operation,
            });
            const partial = finite(resource["trade"]);
            const completed =
              operation.kind === "add"
                ? partial === undefined
                  ? 0
                  : partial - before
                : operation.kind === "remove"
                  ? partial === undefined
                    ? 0
                    : before - partial
                  : 0;
            const partialTotal =
              partial === undefined
                ? undefined
                : expectedTotal + (Math.abs(partial) - Math.abs(before));
            if (
              completed > 0 &&
              completed < count &&
              dependencies.rootState.readRoot() === captured.session.root &&
              dependencies.board.isCurrent(board) &&
              readProperty(
                readProperty(captured.session.root, "city"),
                "market",
              ) === captured.session.market &&
              readProperty(captured.session.root, "resource") ===
                captured.session.resourceContainer &&
              readProperty(
                captured.session.resourceContainer,
                operation.resourceId,
              ) === resource &&
              finite(captured.session.market["trade"]) === partialTotal &&
              dependencies.controls.resolve(control.elementId)?.generation ===
                control.generation
            )
              testSurface?.onTrace?.({
                kind: "partial-native-execution",
                operation,
                requestedCount: count,
                completedCount: completed,
              });
            return;
          }
          const after =
            operation.kind === "zero"
              ? 0
              : before + (operation.kind === "add" ? count : -count);
          const observedAfter = finite(resource["trade"]);
          const totalAfter =
            operation.kind === "zero"
              ? expectedTotal - Math.abs(before)
              : expectedTotal + (Math.abs(after) - Math.abs(before));
          const authorityStillCurrent =
            dependencies.rootState.readRoot() === captured.session.root &&
            dependencies.board.isCurrent(board) &&
            readProperty(
              readProperty(captured.session.root, "city"),
              "market",
            ) === captured.session.market &&
            readProperty(captured.session.root, "resource") ===
              captured.session.resourceContainer &&
            readProperty(
              readProperty(captured.session.root, "resource"),
              operation.resourceId,
            ) === resource &&
            dependencies.controls.resolve(control.elementId)?.generation ===
              control.generation;
          const observedMarketCount = finite(captured.session.market["trade"]);
          const observedPartialCount =
            operation.kind === "add"
              ? (observedAfter ?? before) - before
              : operation.kind === "remove"
                ? before - (observedAfter ?? before)
                : 0;
          const observedPartialTotal =
            expectedTotal +
            (Math.abs(observedAfter ?? before) - Math.abs(before));
          const partialNativeExecution =
            authorityStillCurrent &&
            operation.kind !== "zero" &&
            observedPartialCount > 0 &&
            observedPartialCount < count &&
            observedMarketCount === observedPartialTotal;
          if (
            !authorityStillCurrent ||
            observedAfter !== after ||
            observedMarketCount !== totalAfter
          ) {
            testSurface?.onTrace?.({
              kind: "skipped",
              reason: partialNativeExecution
                ? "native-partial-execution"
                : "native-result-mismatch",
              operation,
            });
            if (partialNativeExecution)
              testSurface?.onTrace?.({
                kind: "partial-native-execution",
                operation,
                requestedCount: count,
                completedCount: observedPartialCount,
              });
            return;
          }
          const transitionTotalBefore = expectedTotal;
          expected.set(operation.resourceId, after);
          expectedTotal = totalAfter;
          let transitionResource = before;
          let transitionTotal =
            operation.kind === "zero" ? totalAfter : transitionTotalBefore;
          for (let index = 0; index < count; index += 1) {
            if (operation.kind !== "zero") {
              const nextResource =
                transitionResource + (operation.kind === "add" ? 1 : -1);
              transitionTotal +=
                Math.abs(nextResource) - Math.abs(transitionResource);
              transitionResource = nextResource;
            }
            testSurface?.onTrace?.({
              kind: "applied",
              operation,
              control: Object.freeze({
                elementId: control.elementId,
                generation: control.generation,
                method,
              }),
              routeCount: transitionTotal,
            });
          }
          remaining -= count;
        }
      }
      testSurface?.onTrace?.({ kind: "complete", operations });
      // The game recomputes Money.diff during the next period. The old manager's writeback is not
      // valid on DeadSpace, whose resource record owns that derived value.
    },
  });
}

export function createCapturedTradeRoutesTestControl(
  dependencies: CapturedTradeRoutesDependencies,
): Readonly<{
  inspect(resourceId: string): Readonly<Record<string, unknown>> | undefined;
  removeOne(resourceId: string): Readonly<Record<string, unknown>>;
  addOne(
    resourceId: string,
    options?: Readonly<{ requireDemand?: boolean }>,
  ): Readonly<Record<string, unknown>>;
}> {
  const capture = (resourceId: string) => {
    const board = dependencies.board.current();
    if (board === undefined || board.mode !== "global") return undefined;
    const captured = readRouteInput(dependencies, board, (reason) =>
      dependencies.testSurface?.onTrace?.({
        kind: "capture-unavailable",
        reason,
      }),
    );
    const observation = captured?.observations.find(
      (entry) => entry.resourceId === resourceId,
    );
    const control = captured?.session.controls.get(resourceId);
    if (
      captured === undefined ||
      observation === undefined ||
      control === undefined
    )
      return undefined;
    return { board, captured, observation, control };
  };
  return Object.freeze({
    inspect(resourceId: string) {
      const current = capture(resourceId);
      const settings = settingsRecord(dependencies.readSettings());
      if (current === undefined) {
        const board = dependencies.board.current();
        const control = dependencies.controls.resolve(`market-${resourceId}`);
        const rows = board?.rows.map((row) => {
          const handle = dependencies.controls.resolve(row.elementId);
          return Object.freeze({
            elementId: row.elementId,
            generation: row.generation,
            currentGeneration: handle?.generation,
            methods: handle?.methods ?? [],
          });
        });
        return Object.freeze({
          status: "capture-unavailable",
          resourceId,
          rootAvailable: dependencies.rootState.readRoot() !== undefined,
          boardAvailable: board !== undefined,
          boardMode: board?.mode,
          boardCurrent:
            board === undefined ? false : dependencies.board.isCurrent(board),
          boardRows: rows ?? [],
          targetControl:
            control === undefined
              ? undefined
              : Object.freeze({
                  elementId: control.elementId,
                  generation: control.generation,
                  methods: control.methods,
                }),
          ownerEnabled: settings["autoMarket"] === true,
          importEnabled: settings[`res_trade_buy_${resourceId}`] === true,
        });
      }
      return Object.freeze({
        status: "captured",
        resourceId,
        control: Object.freeze({
          elementId: current.control.elementId,
          generation: current.control.generation,
          methods: current.control.methods,
        }),
        rootCurrent:
          dependencies.rootState.readRoot() === current.captured.session.root,
        boardCurrent: dependencies.board.isCurrent(current.board),
        ownerEnabled: settings["autoMarket"] === true,
        importEnabled: settings[`res_trade_buy_${resourceId}`] === true,
        routeCount: current.captured.session.marketRouteCount,
        maximumRoutes: current.captured.input.maxTradeRoutes,
        resource: current.observation,
        money: current.captured.input.money,
      });
    },
    removeOne(resourceId: string) {
      const current = capture(resourceId);
      if (current === undefined)
        return Object.freeze({ status: "unknown-control" });
      const { board, captured, observation, control } = current;
      const settings = settingsRecord(dependencies.readSettings());
      const method = observation.currentRoutes > 0 ? "autoSell" : "autoBuy";
      const assignmentEnabled =
        observation.currentRoutes > 0
          ? settings[`res_trade_buy_${resourceId}`] === true
          : settings[`res_trade_sell_${resourceId}`] === true;
      if (settings["autoMarket"] !== true || !assignmentEnabled)
        return Object.freeze({ status: "permission-disabled" });
      if (
        dependencies.rootState.readRoot() !== captured.session.root ||
        !dependencies.board.isCurrent(board) ||
        dependencies.controls.resolve(control.elementId)?.generation !==
          control.generation
      )
        return Object.freeze({ status: "stale-control" });
      if (observation.currentRoutes === 0)
        return Object.freeze({ status: "not-eligible" });
      const beforeMarketCount = finite(captured.session.market["trade"]);
      const resource = readProperty(
        readProperty(captured.session.root, "resource"),
        resourceId,
      );
      const beforeRouteCount = finite(readProperty(resource, "trade"));
      if (
        beforeMarketCount !== captured.session.marketRouteCount ||
        beforeRouteCount !== observation.currentRoutes
      )
        return Object.freeze({ status: "stale-observation" });
      const invoked = dependencies.controls.invoke(control, method, [
        resourceId,
        1,
      ]);
      if (!invoked.ok) return Object.freeze({ status: invoked.reason });
      const afterRouteCount = finite(readProperty(resource, "trade"));
      const afterMarketCount = finite(captured.session.market["trade"]);
      const stillCurrent =
        dependencies.rootState.readRoot() === captured.session.root &&
        dependencies.board.isCurrent(board) &&
        dependencies.controls.resolve(control.elementId)?.generation ===
          control.generation;
      return Object.freeze({
        status:
          stillCurrent &&
          afterRouteCount ===
            beforeRouteCount + (beforeRouteCount > 0 ? -1 : 1) &&
          afterMarketCount === beforeMarketCount - 1
            ? "applied"
            : "native-result-mismatch",
        resourceId,
        control: Object.freeze({
          elementId: control.elementId,
          generation: control.generation,
          method,
        }),
        beforeRouteCount,
        afterRouteCount,
        beforeMarketCount,
        afterMarketCount,
        rootCurrent: stillCurrent,
        boardCurrent: dependencies.board.isCurrent(board),
      });
    },
    addOne(
      resourceId: string,
      options: Readonly<{ requireDemand?: boolean }> = {},
    ) {
      const current = capture(resourceId);
      if (current === undefined)
        return Object.freeze({ status: "unknown-control" });
      const { board, captured, observation, control } = current;
      const settings = settingsRecord(dependencies.readSettings());
      if (
        settings["autoMarket"] !== true ||
        settings[`res_trade_buy_${resourceId}`] !== true
      )
        return Object.freeze({ status: "permission-disabled" });
      if (
        dependencies.rootState.readRoot() !== captured.session.root ||
        !dependencies.board.isCurrent(board) ||
        dependencies.controls.resolve(control.elementId)?.generation !==
          control.generation
      )
        return Object.freeze({ status: "stale-control" });
      if (
        (options.requireDemand !== false &&
          (!observation.demanded ||
            observation.holding >= observation.storageRequiredQuantity)) ||
        observation.holding >= observation.capacity ||
        observation.currentRoutes < 0 ||
        observation.currentRoutes >= captured.input.importRouteCap ||
        captured.session.marketRouteCount >= captured.input.maxTradeRoutes
      )
        return Object.freeze({
          status: "not-eligible",
          demandObserved: observation.demanded,
          holding: observation.holding,
          storageRequiredQuantity: observation.storageRequiredQuantity,
          capacity: observation.capacity,
          currentRoutes: observation.currentRoutes,
          maximumResourceRoutes: captured.input.importRouteCap,
          routeCount: captured.session.marketRouteCount,
          maximumRoutes: captured.input.maxTradeRoutes,
        });
      const beforeMarketCount = finite(captured.session.market["trade"]);
      const resource = readProperty(
        readProperty(captured.session.root, "resource"),
        resourceId,
      );
      const beforeRouteCount = finite(readProperty(resource, "trade"));
      if (
        beforeMarketCount !== captured.session.marketRouteCount ||
        beforeRouteCount !== observation.currentRoutes
      )
        return Object.freeze({ status: "stale-observation" });
      const invoked = dependencies.controls.invoke(control, "autoBuy", [
        resourceId,
        1,
      ]);
      if (!invoked.ok) return Object.freeze({ status: invoked.reason });
      const afterRouteCount = finite(readProperty(resource, "trade"));
      const afterMarketCount = finite(captured.session.market["trade"]);
      const stillCurrent =
        dependencies.rootState.readRoot() === captured.session.root &&
        dependencies.board.isCurrent(board) &&
        dependencies.controls.resolve(control.elementId)?.generation ===
          control.generation;
      return Object.freeze({
        status:
          stillCurrent &&
          afterRouteCount === beforeRouteCount + 1 &&
          afterMarketCount === beforeMarketCount + 1
            ? "applied"
            : "native-result-mismatch",
        demandObserved: observation.demanded,
        storageRequiredQuantity: observation.storageRequiredQuantity,
        control: Object.freeze({
          elementId: control.elementId,
          generation: control.generation,
          method: "autoBuy",
        }),
        quote: Object.freeze({
          pricePerPeriod: observation.importPricePerPeriod,
          quantityPerPeriod: observation.importQuantityPerPeriod,
        }),
        beforeRouteCount,
        afterRouteCount,
        beforeMarketCount,
        afterMarketCount,
        rootCurrent: stillCurrent,
        boardCurrent: dependencies.board.isCurrent(board),
      });
    },
  });
}
