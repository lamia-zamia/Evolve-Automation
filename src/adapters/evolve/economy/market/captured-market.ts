import type {
  MarketBuyInput,
  MarketDecision,
  MarketGateInput,
  MarketSellInput,
  MarketSessionInput,
} from "../../../../domain/economy/market/market.ts";
import type { DecisionExecutor } from "../../../../ports/decision-executor.ts";
import type { GameControlHandle } from "../../../../ports/game-control-registry.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { MarketReader } from "../../../../ports/market.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { finite, isRecord, readProperty } from "../../../validation.ts";
import { readScriptCyclesPerSecond } from "../../captured-tick-rate.ts";

export const MARKET_QUANTITY_CONTROL = "market-qty";

interface CapturedMarketDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readDemand?: () => {
    readonly isDemanded: (resourceId: string) => boolean;
  };
  readonly onUnavailable?: (resourceId: string, reason: string) => void;
}

interface MarketSession {
  readonly root: unknown;
  readonly quantityControl: GameControlHandle;
  readonly rowGenerations: ReadonlyMap<string, number>;
  readonly resourceIds: readonly string[];
  readonly originalMultiplier: number;
  readonly maximumMultiplier: number;
  readonly minimumMoneyAllowed: number;
}

const TRAIT_VALUES: Readonly<{
  readonly arrogant: readonly number[];
  readonly merchant: readonly number[];
  readonly connivingBuy: readonly number[];
  readonly connivingSell: readonly number[];
  readonly asymmetrical: readonly number[];
}> = Object.freeze({
  arrogant: Object.freeze([16, 14, 12, 10, 8, 6, 5]),
  merchant: Object.freeze([5, 10, 15, 25, 35, 40, 45]),
  connivingBuy: Object.freeze([1, 2, 3, 5, 8, 10, 12]),
  connivingSell: Object.freeze([6, 8, 10, 15, 20, 24, 28]),
  asymmetrical: Object.freeze([35, 30, 25, 20, 15, 10, 5]),
});

const TRAIT_RANKS: readonly number[] = Object.freeze([
  0.1, 0.25, 0.5, 1, 2, 3, 4,
]);

function settingsRecord(value: unknown): Record<PropertyKey, unknown> {
  return isRecord(value) ? value : {};
}

function readMultiplier(
  race: Record<PropertyKey, unknown>,
  trait: string,
  values: readonly number[],
  increase: boolean,
): number | undefined {
  if (!race[trait]) return 1;
  // DeadSpace's traitRank can remap every market trait when Empowered is active. The captured
  // root does not expose empowered.vars(), so refusing this one case is safer than pricing a
  // trade with a rank that differs from the game's closure.
  if (race["empowered"]) return undefined;
  const rank = finite(race[trait]);
  if (rank === undefined) return undefined;
  const index = TRAIT_RANKS.indexOf(rank);
  const value = index >= 0 ? values[index] : undefined;
  return value === undefined
    ? undefined
    : 1 + (increase ? value : -value) / 100;
}

function readFathom(
  root: unknown,
  race: Record<PropertyKey, unknown>,
  target: string,
): number | undefined {
  if (!race["unfathomable"]) return 0;
  const city = readProperty(root, "city");
  const dwellers = readProperty(city, "surfaceDwellers");
  if (!Array.isArray(dwellers) || !dwellers.includes(target)) return 0;
  const housing = readProperty(city, "captive_housing");
  const civic = readProperty(root, "civic");
  const torturer = readProperty(civic, "torturer");
  const workers = finite(readProperty(torturer, "workers"));
  const index = dwellers.indexOf(target);
  const active = finite(readProperty(housing, `race${index}`));
  if (workers === undefined || active === undefined) return undefined;
  let adjusted = Math.min(active, 100);
  if (adjusted > workers) {
    adjusted -= Math.ceil((adjusted - workers) / 3);
  }
  const nightmare = readProperty(readProperty(root, "stats"), "achieve");
  const mg = finite(readProperty(readProperty(nightmare, "nightmare"), "mg"));
  return (adjusted / 100) * ((mg ?? 0) / 5);
}

function readUnitPrices(
  root: unknown,
  resource: Record<PropertyKey, unknown>,
): { readonly buy: number; readonly sell: number } | undefined {
  const value = finite(resource["value"]);
  const race = readProperty(root, "race");
  if (value === undefined || value <= 0 || !isRecord(race)) return undefined;

  const arrogant = readMultiplier(
    race,
    "arrogant",
    TRAIT_VALUES.arrogant,
    true,
  );
  const connivingBuy = readMultiplier(
    race,
    "conniving",
    TRAIT_VALUES.connivingBuy,
    false,
  );
  const merchant = readMultiplier(
    race,
    "merchant",
    TRAIT_VALUES.merchant,
    false,
  );
  const asymmetrical = readMultiplier(
    race,
    "asymmetrical",
    TRAIT_VALUES.asymmetrical,
    true,
  );
  const connivingSell = readMultiplier(
    race,
    "conniving",
    TRAIT_VALUES.connivingSell,
    false,
  );
  const impFathom = readFathom(root, race, "imp");
  const goblinFathom = readFathom(root, race, "goblin");
  if (
    arrogant === undefined ||
    connivingBuy === undefined ||
    merchant === undefined ||
    asymmetrical === undefined ||
    connivingSell === undefined ||
    impFathom === undefined ||
    goblinFathom === undefined
  ) {
    return undefined;
  }

  const buy = value * arrogant * connivingBuy * (1 - (impFathom * 5) / 100);
  const sellDivide =
    4 *
    merchant *
    (1 - (goblinFathom * 25) / 100) *
    asymmetrical *
    connivingSell *
    (1 - (impFathom * 15) / 100);
  const sell = value / sellDivide;
  return Number.isFinite(buy) && Number.isFinite(sell) && sellDivide > 0
    ? Object.freeze({ buy, sell })
    : undefined;
}

function resourceStorageRatio(resource: Record<PropertyKey, unknown>): number {
  const amount = finite(resource["amount"]);
  const maximum = finite(resource["max"]);
  return amount !== undefined && maximum !== undefined && maximum > 0
    ? amount / maximum
    : 1;
}

function resourceMaximum(resource: Record<PropertyKey, unknown>): number {
  const maximum = finite(resource["max"]);
  return maximum !== undefined && maximum >= 0 ? maximum : 0;
}

function maximumMultiplier(root: unknown): number {
  const currency = finite(readProperty(readProperty(root, "tech"), "currency"));
  return currency !== undefined && currency >= 6
    ? 1_000_000
    : currency !== undefined && currency >= 4
      ? 5_000
      : 100;
}

function emptySell(
  index: number,
  resourceId: string,
  ignoreSellRatio: boolean,
): MarketSellInput {
  return Object.freeze({
    index,
    resourceId,
    eligible: false,
    autoSellEnabled: false,
    ignoreSellRatio,
    storageRatio: 0,
    autoSellRatio: 0,
    moneyMaximum: 0,
    moneyCurrent: 0,
    unitPrice: 1,
    currentQuantity: 0,
    maxQuantity: 0,
    income: 0,
    ticksPerSecond: 1,
    maximumMultiplier: 1,
  });
}

function emptyBuy(index: number, resourceId: string): MarketBuyInput {
  return Object.freeze({
    index,
    resourceId,
    eligible: false,
    autoBuyEnabled: false,
    storageRatio: 0,
    autoBuyRatio: 0,
    moneyDemanded: false,
    moneyCurrent: 0,
    minimumMoneyAllowed: 0,
    unitPrice: 1,
    currentQuantity: 0,
    maxQuantity: 0,
    maximumMultiplier: 1,
  });
}

function readPriorityIds(
  resources: Record<PropertyKey, unknown>,
  settings: Record<PropertyKey, unknown>,
): readonly string[] {
  return Object.keys(resources)
    .map((id, index) => ({
      id,
      index,
      resource: readProperty(resources, id),
      priority: finite(settings[`res_buy_p_${id}`]) ?? Number.MAX_SAFE_INTEGER,
    }))
    .filter(
      (entry) =>
        isRecord(entry.resource) && Object.hasOwn(entry.resource, "trade"),
    )
    .sort(
      (left, right) =>
        left.priority - right.priority || left.index - right.index,
    )
    .map((entry) => entry.id);
}

export function createCapturedMarketPorts(
  dependencies: CapturedMarketDependencies,
): {
  readonly reader: MarketReader;
  readonly executor: DecisionExecutor<MarketDecision>;
} {
  let session: MarketSession | null = null;
  let lastResourceId: string | null = null;

  const reader: MarketReader = Object.freeze({
    readGate(): MarketGateInput {
      session = null;
      const root = dependencies.rootState.readRoot();
      const settings = readProperty(root, "settings");
      const race = readProperty(root, "race");
      return Object.freeze({
        unlocked: readProperty(settings, "showMarket") === true,
        noTrade: Boolean(readProperty(race, "no_trade")),
      });
    },

    readSession(): MarketSessionInput {
      const root = dependencies.rootState.readRoot();
      const settings = settingsRecord(dependencies.readSettings());
      const resources = readProperty(root, "resource");
      const cityMarket = readProperty(readProperty(root, "city"), "market");
      const money = readProperty(resources, "Money");
      const quantityControl = dependencies.controls.resolve(
        MARKET_QUANTITY_CONTROL,
      );
      if (
        !isRecord(resources) ||
        !isRecord(cityMarket) ||
        !isRecord(money) ||
        quantityControl === undefined
      ) {
        throw new Error("captured market controls are unavailable");
      }
      const originalMultiplier = finite(cityMarket["qty"]);
      const moneyMaximum = finite(money["max"]);
      const moneyCurrent = finite(money["amount"]);
      if (
        originalMultiplier === undefined ||
        !Number.isSafeInteger(originalMultiplier) ||
        originalMultiplier < 1 ||
        moneyMaximum === undefined ||
        moneyCurrent === undefined
      ) {
        throw new TypeError("captured market quantities are invalid");
      }
      const minimumMoneyAllowed = Math.max(
        (moneyMaximum * (finite(settings["minimumMoneyPercentage"]) ?? 0)) /
          100,
        finite(settings["minimumMoney"]) ?? 0,
      );
      const resourceIds = readPriorityIds(resources, settings);
      const rowGenerations = new Map<string, number>();
      for (const resourceId of resourceIds) {
        const row = dependencies.controls.resolve(`market-${resourceId}`);
        if (row !== undefined) rowGenerations.set(resourceId, row.generation);
      }
      session = Object.freeze({
        root,
        quantityControl,
        rowGenerations,
        resourceIds: Object.freeze(resourceIds),
        originalMultiplier,
        maximumMultiplier: maximumMultiplier(root),
        minimumMoneyAllowed,
      });
      lastResourceId = null;
      return Object.freeze({
        originalMultiplier,
        maximumMultiplier: session.maximumMultiplier,
        minimumMoneyAllowed,
      });
    },

    readSell(index: number, ignoreSellRatio: boolean): MarketSellInput | null {
      const active = session;
      if (active === null) throw new Error("market session is unavailable");
      const resourceId = active.resourceIds[index];
      if (resourceId === undefined) {
        lastResourceId = null;
        return null;
      }
      lastResourceId = resourceId;
      const root = active.root;
      const resources = readProperty(root, "resource");
      const resource = readProperty(resources, resourceId);
      const money = readProperty(resources, "Money");
      const control = dependencies.controls.resolve(`market-${resourceId}`);
      if (
        !isRecord(resource) ||
        !isRecord(money) ||
        control === undefined ||
        !control.methods.includes("purchase") ||
        !control.methods.includes("sell")
      ) {
        return emptySell(index, resourceId, ignoreSellRatio);
      }
      const currentQuantity = finite(resource["amount"]);
      const maxQuantity = resourceMaximum(resource);
      const moneyMaximum = finite(money["max"]);
      const moneyCurrent = finite(money["amount"]);
      const prices = readUnitPrices(root, resource);
      const settings = settingsRecord(dependencies.readSettings());
      const autoSellRatio = finite(settings[`res_sell_r_${resourceId}`]) ?? 0;
      const storageRatio = resourceStorageRatio(resource);
      const income = finite(resource["diff"]);
      const ticksPerSecond = readScriptCyclesPerSecond(settings);
      if (
        currentQuantity === undefined ||
        moneyMaximum === undefined ||
        moneyCurrent === undefined ||
        prices === undefined ||
        income === undefined ||
        ticksPerSecond <= 0
      ) {
        dependencies.onUnavailable?.(
          resourceId,
          "market price or quantity is unavailable",
        );
        return emptySell(index, resourceId, ignoreSellRatio);
      }
      return Object.freeze({
        index,
        resourceId,
        eligible: true,
        autoSellEnabled: settings[`sell${resourceId}`] === true,
        ignoreSellRatio,
        storageRatio,
        autoSellRatio,
        moneyMaximum,
        moneyCurrent,
        unitPrice: prices.sell,
        currentQuantity,
        maxQuantity,
        income,
        ticksPerSecond,
        maximumMultiplier: active.maximumMultiplier,
      });
    },

    readBuy(index: number, minimumMoneyAllowed: number): MarketBuyInput {
      const active = session;
      const resourceId = active?.resourceIds[index];
      if (
        active === null ||
        active === undefined ||
        resourceId === undefined ||
        lastResourceId !== resourceId
      ) {
        throw new Error("market buy must follow its sell candidate");
      }
      const resources = readProperty(active.root, "resource");
      const resource = readProperty(resources, resourceId);
      const money = readProperty(resources, "Money");
      const control = dependencies.controls.resolve(`market-${resourceId}`);
      if (
        !isRecord(resource) ||
        !isRecord(money) ||
        control === undefined ||
        !control.methods.includes("purchase") ||
        !control.methods.includes("sell")
      ) {
        return emptyBuy(index, resourceId);
      }
      const currentQuantity = finite(resource["amount"]);
      const maxQuantity = resourceMaximum(resource);
      const moneyCurrent = finite(money["amount"]);
      const prices = readUnitPrices(active.root, resource);
      const settings = settingsRecord(dependencies.readSettings());
      const autoBuyRatio = finite(settings[`res_buy_r_${resourceId}`]) ?? 0;
      if (
        currentQuantity === undefined ||
        moneyCurrent === undefined ||
        prices === undefined
      ) {
        dependencies.onUnavailable?.(
          resourceId,
          "market price or quantity is unavailable",
        );
        return emptyBuy(index, resourceId);
      }
      return Object.freeze({
        index,
        resourceId,
        eligible: true,
        autoBuyEnabled: settings[`buy${resourceId}`] === true,
        storageRatio: resourceStorageRatio(resource),
        autoBuyRatio,
        moneyDemanded:
          dependencies.readDemand?.()?.isDemanded("Money") ?? false,
        moneyCurrent,
        minimumMoneyAllowed,
        unitPrice: prices.buy,
        currentQuantity,
        maxQuantity,
        maximumMultiplier: active.maximumMultiplier,
      });
    },
  });

  const executor: DecisionExecutor<MarketDecision> = Object.freeze({
    execute(decision: Readonly<MarketDecision>) {
      const active = session;
      if (active === null) {
        return stale(
          "captured-market-session-missing",
          "market sample is unavailable",
        );
      }
      if (decision.kind === "restore-multiplier") {
        if (
          !Number.isSafeInteger(decision.multiplier) ||
          decision.multiplier < 1
        ) {
          return rejected(
            "invalid-market-multiplier",
            "market multiplier must be a positive safe integer",
          );
        }
        return setMultiplier(active, decision.multiplier);
      }
      if (
        !Number.isSafeInteger(decision.multiplier) ||
        decision.multiplier < 1 ||
        decision.multiplier > active.maximumMultiplier ||
        !Number.isSafeInteger(decision.repetitions) ||
        decision.repetitions < 1
      ) {
        return rejected(
          "invalid-captured-market-trade",
          "market trade quantities are invalid",
        );
      }
      if (
        !Number.isSafeInteger(decision.index) ||
        decision.index < 0 ||
        active.resourceIds[decision.index] !== decision.resourceId
      ) {
        return stale(
          "captured-market-resource-changed",
          "market resource ordering changed",
        );
      }
      if (dependencies.rootState.readRoot() !== active.root) {
        return stale(
          "captured-market-root-changed",
          "captured game root changed",
        );
      }
      const resource = readProperty(
        readProperty(active.root, "resource"),
        decision.resourceId,
      );
      const money = readProperty(
        readProperty(active.root, "resource"),
        "Money",
      );
      const prices = isRecord(resource)
        ? readUnitPrices(active.root, resource)
        : undefined;
      if (
        !isRecord(resource) ||
        !isRecord(money) ||
        finite(money["amount"]) !== decision.expectedMoneyCurrent ||
        finite(resource["amount"]) !== decision.expectedResourceCurrent ||
        prices === undefined ||
        prices[decision.side] !== decision.expectedUnitPrice
      ) {
        return stale("captured-market-state-changed", "market inputs changed");
      }
      const control = dependencies.controls.resolve(
        `market-${decision.resourceId}`,
      );
      if (
        control === undefined ||
        control.generation !== active.rowGenerations.get(decision.resourceId) ||
        !control.methods.includes(decision.side === "buy" ? "purchase" : "sell")
      ) {
        return stale(
          "captured-market-control-changed",
          "market row control changed",
        );
      }
      const result = setMultiplier(active, decision.multiplier);
      if (result.status !== "succeeded") return result;
      const method = decision.side === "buy" ? "purchase" : "sell";
      for (
        let repetition = 0;
        repetition < decision.repetitions;
        repetition += 1
      ) {
        const invoked = dependencies.controls.invoke(control, method, [
          decision.resourceId,
        ]);
        if (!invoked.ok) {
          return rejected(
            "captured-market-control-failed",
            `${method} control failed`,
          );
        }
      }
      return SUCCEEDED;
    },
  });

  function setMultiplier(active: MarketSession, multiplier: number) {
    if (multiplier > active.maximumMultiplier) {
      return rejected(
        "invalid-market-multiplier",
        "market multiplier exceeds the game limit",
      );
    }
    if (dependencies.rootState.readRoot() !== active.root) {
      return stale(
        "captured-market-root-changed",
        "captured game root changed",
      );
    }
    const control = dependencies.controls.resolve(MARKET_QUANTITY_CONTROL);
    if (
      control === undefined ||
      control.generation !== active.quantityControl.generation
    ) {
      return stale(
        "captured-market-quantity-control-changed",
        "market quantity control changed",
      );
    }
    const data = control.data;
    if (
      !isRecord(data) ||
      data !== readProperty(readProperty(active.root, "city"), "market")
    ) {
      return stale(
        "captured-market-quantity-state-changed",
        "market quantity state changed",
      );
    }
    Reflect.set(data, "qty", multiplier);
    return finite(data["qty"]) === multiplier
      ? SUCCEEDED
      : rejected(
          "captured-market-quantity-failed",
          "market quantity did not change",
        );
  }

  return Object.freeze({ reader, executor });
}
