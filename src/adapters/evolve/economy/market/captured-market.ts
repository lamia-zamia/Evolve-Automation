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
import { isRegionalSupply } from "../../captured-affordability.ts";
import { readUnitPrices } from "./captured-instant-market-price.ts";
import type {
  MarketBoard,
  MarketBoardSource,
} from "./captured-market-board.ts";

export const MARKET_QUANTITY_CONTROL = "market-qty";

interface CapturedMarketDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly board: MarketBoardSource;
  readonly readSettings: () => unknown;
  readonly readDemand?: () => {
    readonly isDemanded: (resourceId: string) => boolean;
  };
  readonly onUnavailable?: (resourceId: string, reason: string) => void;
}

interface MarketSession {
  readonly root: unknown;
  readonly board: MarketBoard;
  readonly settings: Readonly<Record<string, unknown>>;
  readonly quantityControl: GameControlHandle;
  readonly rowGenerations: ReadonlyMap<string, number>;
  readonly resourceIds: readonly string[];
  readonly originalMultiplier: number;
  readonly maximumMultiplier: number;
  readonly minimumMoneyAllowed: number;
  ownedMultiplier: number;
}

function settingsRecord(value: unknown): Record<PropertyKey, unknown> {
  return isRecord(value) ? value : {};
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
  board: MarketBoard,
  settings: Record<PropertyKey, unknown>,
): readonly string[] {
  return board.rows
    .map((row, index) => ({
      id: row.elementId.slice("market-".length),
      index,
      priority:
        finite(
          settings[`res_buy_p_${row.elementId.slice("market-".length)}`],
        ) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort(
      (left, right) =>
        left.priority - right.priority || left.index - right.index,
    )
    .map((entry) => entry.id);
}

function marketSettingsSnapshot(
  source: unknown,
  rows: readonly GameControlHandle[],
): Readonly<Record<string, unknown>> {
  const settings = settingsRecord(source);
  const snapshot: Record<string, unknown> = {
    minimumMoney: finite(settings["minimumMoney"]) ?? 0,
    minimumMoneyPercentage: finite(settings["minimumMoneyPercentage"]) ?? 0,
    tickRate: finite(settings["tickRate"]),
  };
  for (const row of rows) {
    const id = row.elementId.slice("market-".length);
    snapshot[`buy${id}`] = settings[`buy${id}`] === true;
    snapshot[`sell${id}`] = settings[`sell${id}`] === true;
    snapshot[`res_buy_r_${id}`] = finite(settings[`res_buy_r_${id}`]) ?? 0;
    snapshot[`res_sell_r_${id}`] = finite(settings[`res_sell_r_${id}`]) ?? 0;
    snapshot[`res_buy_p_${id}`] =
      finite(settings[`res_buy_p_${id}`]) ?? Number.MAX_SAFE_INTEGER;
  }
  return Object.freeze(snapshot);
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
      const board = dependencies.board.current();
      return Object.freeze({
        unlocked:
          readProperty(settings, "showMarket") === true &&
          board !== undefined &&
          board.root === root,
        ordinary: board?.mode === "global" && !isRegionalSupply(root),
        noTrade: Boolean(readProperty(race, "no_trade")),
      });
    },

    readSession(): MarketSessionInput {
      const root = dependencies.rootState.readRoot();
      const board = dependencies.board.current();
      if (
        board === undefined ||
        board.root !== root ||
        board.mode !== "global" ||
        board.quantity === undefined
      )
        throw new Error("current ordinary market board is unavailable");
      // Market planning and its immediate execution share this one synchronous application stack.
      const settings = marketSettingsSnapshot(
        dependencies.readSettings(),
        board.rows,
      );
      const resources = readProperty(root, "resource");
      const cityMarket = readProperty(readProperty(root, "city"), "market");
      const money = readProperty(resources, "Money");
      const quantityControl = board.quantity;
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
      const resourceIds = readPriorityIds(board, settings);
      const rowGenerations = new Map<string, number>();
      for (const row of board.rows)
        rowGenerations.set(
          row.elementId.slice("market-".length),
          row.generation,
        );
      session = {
        root,
        board,
        settings,
        quantityControl,
        rowGenerations,
        resourceIds: Object.freeze(resourceIds),
        originalMultiplier,
        maximumMultiplier: maximumMultiplier(root),
        minimumMoneyAllowed,
        ownedMultiplier: originalMultiplier,
      };
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
      if (!dependencies.board.isCurrent(active.board))
        throw new Error("market board changed during session");
      const resources = readProperty(root, "resource");
      const resource = readProperty(resources, resourceId);
      const money = readProperty(resources, "Money");
      const control = dependencies.controls.resolve(`market-${resourceId}`);
      if (
        !isRecord(resource) ||
        !isRecord(money) ||
        control === undefined ||
        control.generation !== active.rowGenerations.get(resourceId) ||
        !control.methods.includes("purchase") ||
        !control.methods.includes("sell")
      ) {
        throw new Error("current market row is unavailable");
      }
      const currentQuantity = finite(resource["amount"]);
      const maxQuantity = resourceMaximum(resource);
      const moneyMaximum = finite(money["max"]);
      const moneyCurrent = finite(money["amount"]);
      const prices = readUnitPrices(root, resource);
      const settings = active.settings;
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
      if (!dependencies.board.isCurrent(active.board))
        throw new Error("market board changed during session");
      const resource = readProperty(resources, resourceId);
      const money = readProperty(resources, "Money");
      const control = dependencies.controls.resolve(`market-${resourceId}`);
      if (
        !isRecord(resource) ||
        !isRecord(money) ||
        control === undefined ||
        control.generation !== active.rowGenerations.get(resourceId) ||
        !control.methods.includes("purchase") ||
        !control.methods.includes("sell")
      ) {
        throw new Error("current market row is unavailable");
      }
      const currentQuantity = finite(resource["amount"]);
      const maxQuantity = resourceMaximum(resource);
      const moneyCurrent = finite(money["amount"]);
      const prices = readUnitPrices(active.root, resource);
      const settings = active.settings;
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
      if (!dependencies.board.isCurrent(active.board)) {
        return stale("captured-market-board-changed", "market board changed");
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
      let expectedResource = decision.expectedResourceCurrent;
      let expectedMoney = decision.expectedMoneyCurrent;
      for (
        let repetition = 0;
        repetition < decision.repetitions;
        repetition += 1
      ) {
        if (
          dependencies.rootState.readRoot() !== active.root ||
          !dependencies.board.isCurrent(active.board) ||
          dependencies.controls.resolve(control.elementId)?.generation !==
            control.generation ||
          dependencies.controls.resolve(MARKET_QUANTITY_CONTROL)?.generation !==
            active.quantityControl.generation ||
          readProperty(
            readProperty(active.root, "resource"),
            decision.resourceId,
          ) !== resource ||
          readProperty(readProperty(active.root, "resource"), "Money") !==
            money ||
          finite(resource["amount"]) !== expectedResource ||
          finite(money["amount"]) !== expectedMoney ||
          finite(
            readProperty(
              readProperty(readProperty(active.root, "city"), "market"),
              "qty",
            ),
          ) !== active.ownedMultiplier
        )
          return stale(
            "captured-market-sequence-changed",
            "market trade sequence changed",
          );
        const invoked = dependencies.controls.invoke(control, method, [
          decision.resourceId,
        ]);
        if (!invoked.ok) {
          return rejected(
            "captured-market-control-failed",
            `${method} control failed`,
          );
        }
        const nextResource = finite(resource["amount"]);
        const nextMoney = finite(money["amount"]);
        const resourceMax = finite(resource["max"]);
        const moneyMax = finite(money["max"]);
        if (
          dependencies.rootState.readRoot() !== active.root ||
          !dependencies.board.isCurrent(active.board) ||
          dependencies.controls.resolve(control.elementId)?.generation !==
            control.generation ||
          dependencies.controls.resolve(MARKET_QUANTITY_CONTROL)?.generation !==
            active.quantityControl.generation ||
          readProperty(
            readProperty(active.root, "resource"),
            decision.resourceId,
          ) !== resource ||
          readProperty(readProperty(active.root, "resource"), "Money") !==
            money ||
          nextResource === undefined ||
          nextMoney === undefined ||
          resourceMax === undefined ||
          moneyMax === undefined ||
          (decision.side === "buy" &&
            (nextResource < expectedResource ||
              nextMoney > expectedMoney ||
              nextResource > resourceMax)) ||
          (decision.side === "sell" &&
            (nextResource > expectedResource ||
              nextMoney < expectedMoney ||
              nextMoney > moneyMax))
        )
          return stale(
            "captured-market-postcondition-failed",
            "native market trade changed unexpected state",
          );
        if (nextResource === expectedResource && nextMoney === expectedMoney)
          break;
        expectedResource = nextResource;
        expectedMoney = nextMoney;
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
    if (!dependencies.board.isCurrent(active.board)) {
      return stale("captured-market-board-changed", "market board changed");
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
      data !== readProperty(readProperty(active.root, "city"), "market") ||
      finite(data["qty"]) !== active.ownedMultiplier
    ) {
      return stale(
        "captured-market-quantity-state-changed",
        "market quantity state changed",
      );
    }
    Reflect.set(data, "qty", multiplier);
    if (
      finite(data["qty"]) === multiplier &&
      dependencies.board.isCurrent(active.board)
    ) {
      active.ownedMultiplier = multiplier;
      return SUCCEEDED;
    }
    return rejected(
      "captured-market-quantity-failed",
      "market quantity did not change",
    );
  }

  return Object.freeze({ reader, executor });
}
