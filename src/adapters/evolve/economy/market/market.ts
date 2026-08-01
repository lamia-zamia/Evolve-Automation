import type {
  MarketBuyInput,
  MarketDecision,
  MarketGateInput,
  MarketSellInput,
  MarketSessionInput,
} from "../../../../domain/economy/market/market.ts";
import type { DecisionExecutor } from "../../../../ports/decision-executor.ts";
import type { MarketReader } from "../../../../ports/market.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import {
  callBoolean,
  callNumber,
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../../../validation.ts";

interface MarketSession {
  readonly manager: UnknownRecord;
  readonly money: UnknownRecord;
  readonly priorityList: unknown[];
  lastCandidate: MarketCandidate | null;
}

interface MarketCandidate {
  readonly index: number;
  readonly resourceId: string;
  readonly resource: UnknownRecord;
  readonly eligible: boolean;
}

function readResourceId(resource: UnknownRecord, path: string): string {
  const id = resource["id"];
  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError(`${path}.id must be a non-empty string`);
  }
  return id;
}

function emptySell(
  candidate: MarketCandidate,
  ignoreSellRatio: boolean,
): MarketSellInput {
  return Object.freeze({
    index: candidate.index,
    resourceId: candidate.resourceId,
    eligible: candidate.eligible,
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

function emptyBuy(candidate: MarketCandidate): MarketBuyInput {
  return Object.freeze({
    index: candidate.index,
    resourceId: candidate.resourceId,
    eligible: candidate.eligible,
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

export interface MarketReaderDependencies {
  // TRANSITIONAL: MarketManager remains the narrow bridge to the current
  // market quantity and resource Vue controls until Milestone 5.
  readonly getManager: () => unknown;
  readonly getGame: () => unknown;
  readonly getResources: () => unknown;
  readonly getSettings: () => unknown;
  readonly ticksPerSecond: () => number;
}

export function createMarketReader(
  dependencies: MarketReaderDependencies,
): MarketReader {
  let manager: UnknownRecord | null = null;
  let session: MarketSession | null = null;
  let maximumMultiplier = 1;

  return Object.freeze({
    readGate(): MarketGateInput {
      manager = requireRecord(dependencies.getManager(), "MarketManager");
      session = null;
      if (!callBoolean(manager, "isUnlocked", "MarketManager")) {
        return Object.freeze({ unlocked: false, noTrade: false });
      }
      const game = requireRecord(dependencies.getGame(), "game");
      const global = requireRecord(game["global"], "game.global");
      const race = requireRecord(global["race"], "game.global.race");
      return Object.freeze({
        unlocked: true,
        noTrade: Boolean(race["no_trade"]),
      });
    },

    readSession(): MarketSessionInput {
      if (manager === null) {
        throw new Error("market gate must be read before the trading session");
      }
      const resources = requireRecord(dependencies.getResources(), "resources");
      const money = requireRecord(resources["Money"], "resources.Money");
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const moneyMaximum = requireNumber(
        money["maxQuantity"],
        "resources.Money.maxQuantity",
      );
      const minimumPercentage = requireNumber(
        settings["minimumMoneyPercentage"],
        "settings.minimumMoneyPercentage",
      );
      const minimum = requireNumber(
        settings["minimumMoney"],
        "settings.minimumMoney",
      );
      const minimumMoneyAllowed = Math.max(
        (moneyMaximum * minimumPercentage) / 100,
        minimum,
      );
      const originalMultiplier = requireNumber(
        manager["multiplier"],
        "MarketManager.multiplier",
      );
      maximumMultiplier = callNumber(
        manager,
        "getMaxMultiplier",
        "MarketManager",
      );
      if (!Number.isSafeInteger(maximumMultiplier) || maximumMultiplier < 1) {
        throw new TypeError(
          "MarketManager.getMaxMultiplier() must be a positive safe integer",
        );
      }
      const list = manager["priorityList"];
      if (!Array.isArray(list)) {
        throw new TypeError("MarketManager.priorityList must be an array");
      }
      session = {
        manager,
        money,
        priorityList: list,
        lastCandidate: null,
      };
      return Object.freeze({
        originalMultiplier,
        maximumMultiplier,
        minimumMoneyAllowed,
      });
    },

    readSell(index: number, ignoreSellRatio: boolean): MarketSellInput | null {
      if (session === null) {
        throw new Error("market session must be read before sell candidates");
      }
      if (!Number.isSafeInteger(index) || index < 0) {
        throw new TypeError("market candidate index must be non-negative");
      }
      if (index >= session.priorityList.length) {
        session.lastCandidate = null;
        return null;
      }
      const path = `MarketManager.priorityList[${index}]`;
      const resource = requireRecord(session.priorityList[index], path);
      const resourceId = readResourceId(resource, path);
      const flags = requireRecord(resource["is"], `${path}.is`);
      let eligible = Boolean(flags["tradable"]);
      if (eligible) {
        eligible = callBoolean(resource, "isUnlocked", path);
      }
      if (eligible) {
        eligible = callBoolean(
          session.manager,
          "isBuySellUnlocked",
          "MarketManager",
          resource,
        );
      }
      const candidate = { index, resourceId, resource, eligible };
      session.lastCandidate = candidate;
      if (!eligible || !resource["autoSellEnabled"]) {
        return emptySell(candidate, ignoreSellRatio);
      }
      const storageRatio = requireNumber(
        resource["storageRatio"],
        `${path}.storageRatio`,
      );
      const autoSellRatio = requireNumber(
        resource["autoSellRatio"],
        `${path}.autoSellRatio`,
      );
      if (!ignoreSellRatio && storageRatio < autoSellRatio) {
        return Object.freeze({
          ...emptySell(candidate, ignoreSellRatio),
          autoSellEnabled: true,
          storageRatio,
          autoSellRatio,
        });
      }
      const moneyMaximum = requireNumber(
        session.money["maxQuantity"],
        "resources.Money.maxQuantity",
      );
      const moneyCurrent = requireNumber(
        session.money["currentQuantity"],
        "resources.Money.currentQuantity",
      );
      const currentQuantity = requireNumber(
        resource["currentQuantity"],
        `${path}.currentQuantity`,
      );
      const maxQuantity = requireNumber(
        resource["maxQuantity"],
        `${path}.maxQuantity`,
      );
      const usesIncome = storageRatio <= autoSellRatio;
      const ticks = usesIncome
        ? requireNumber(dependencies.ticksPerSecond(), "ticksPerSecond()")
        : 1;
      if (ticks <= 0) {
        throw new TypeError("ticksPerSecond() must be positive");
      }
      return Object.freeze({
        index,
        resourceId,
        eligible: true,
        autoSellEnabled: true,
        ignoreSellRatio,
        storageRatio,
        autoSellRatio,
        moneyMaximum,
        moneyCurrent,
        unitPrice: callNumber(
          session.manager,
          "getUnitSellPrice",
          "MarketManager",
          resource,
        ),
        currentQuantity,
        maxQuantity,
        income: usesIncome
          ? requireNumber(resource["income"], `${path}.income`)
          : 0,
        ticksPerSecond: ticks,
        maximumMultiplier,
      });
    },

    readBuy(index: number, minimumMoneyAllowed: number): MarketBuyInput {
      if (
        session === null ||
        session.lastCandidate === null ||
        session.lastCandidate.index !== index
      ) {
        throw new Error("market buy must follow its sell candidate");
      }
      const candidate = session.lastCandidate;
      const resource = candidate.resource;
      if (!candidate.eligible || resource["autoBuyEnabled"] !== true) {
        return emptyBuy(candidate);
      }
      const path = `MarketManager.priorityList[${index}]`;
      const storageRatio = requireNumber(
        resource["storageRatio"],
        `${path}.storageRatio`,
      );
      const autoBuyRatio = requireNumber(
        resource["autoBuyRatio"],
        `${path}.autoBuyRatio`,
      );
      if (storageRatio >= autoBuyRatio) {
        return Object.freeze({
          ...emptyBuy(candidate),
          autoBuyEnabled: true,
          storageRatio,
          autoBuyRatio,
        });
      }
      const moneyDemanded = callBoolean(
        session.money,
        "isDemanded",
        "resources.Money",
      );
      if (moneyDemanded) {
        return Object.freeze({
          ...emptyBuy(candidate),
          autoBuyEnabled: true,
          storageRatio,
          autoBuyRatio,
          moneyDemanded: true,
        });
      }
      return Object.freeze({
        index,
        resourceId: candidate.resourceId,
        eligible: true,
        autoBuyEnabled: true,
        storageRatio,
        autoBuyRatio,
        moneyDemanded: false,
        moneyCurrent: requireNumber(
          session.money["currentQuantity"],
          "resources.Money.currentQuantity",
        ),
        minimumMoneyAllowed: requireNumber(
          minimumMoneyAllowed,
          "minimumMoneyAllowed",
        ),
        unitPrice: callNumber(
          session.manager,
          "getUnitBuyPrice",
          "MarketManager",
          resource,
        ),
        currentQuantity: requireNumber(
          resource["currentQuantity"],
          `${path}.currentQuantity`,
        ),
        maxQuantity: requireNumber(
          resource["maxQuantity"],
          `${path}.maxQuantity`,
        ),
        maximumMultiplier,
      });
    },
  });
}

function readPriorityList(manager: UnknownRecord): unknown[] {
  const list = manager["priorityList"];
  if (!Array.isArray(list)) {
    throw new TypeError("MarketManager.priorityList must be an array");
  }
  return list;
}

export function createMarketCommandExecutor(
  dependencies: Pick<MarketReaderDependencies, "getManager" | "getResources">,
): DecisionExecutor<MarketDecision> {
  return Object.freeze({
    execute(decision: Readonly<MarketDecision>) {
      if (decision.kind === "restore-multiplier") {
        if (!Number.isFinite(decision.multiplier)) {
          return rejected(
            "invalid-market-multiplier",
            "market multiplier must be finite",
          );
        }
        const manager = requireRecord(
          dependencies.getManager(),
          "MarketManager",
        );
        const setMultiplier = requireFunction(
          manager["setMultiplier"],
          "MarketManager.setMultiplier",
        );
        Reflect.apply(setMultiplier, manager, [decision.multiplier]);
        return SUCCEEDED;
      }
      if (
        !Number.isSafeInteger(decision.repetitions) ||
        decision.repetitions < 1 ||
        !Number.isSafeInteger(decision.multiplier)
      ) {
        return rejected(
          "invalid-market-trade",
          "market trade multiplier and repetitions must be safe integers",
        );
      }
      const manager = requireRecord(dependencies.getManager(), "MarketManager");
      const setMultiplier = requireFunction(
        manager["setMultiplier"],
        "MarketManager.setMultiplier",
      );
      const list = readPriorityList(manager);
      const raw = list[decision.index];
      const resource =
        typeof raw === "object" && raw !== null ? (raw as UnknownRecord) : null;
      const actualId =
        resource !== null && typeof resource["id"] === "string"
          ? resource["id"]
          : null;
      if (resource === null || actualId !== decision.resourceId) {
        return stale("stale-market-resource", "market priority list changed", {
          index: decision.index,
          expectedResourceId: decision.resourceId,
          actualResourceId: actualId,
        });
      }
      const resources = requireRecord(dependencies.getResources(), "resources");
      const money = requireRecord(resources["Money"], "resources.Money");
      const actualMoney = requireNumber(
        money["currentQuantity"],
        "resources.Money.currentQuantity",
      );
      const actualResource = requireNumber(
        resource["currentQuantity"],
        `resources.${decision.resourceId}.currentQuantity`,
      );
      const priceMethod =
        decision.side === "sell" ? "getUnitSellPrice" : "getUnitBuyPrice";
      const actualPrice = callNumber(
        manager,
        priceMethod,
        "MarketManager",
        resource,
      );
      if (
        actualMoney !== decision.expectedMoneyCurrent ||
        actualResource !== decision.expectedResourceCurrent ||
        actualPrice !== decision.expectedUnitPrice
      ) {
        return stale("stale-market-state", "market inputs changed", {
          resourceId: decision.resourceId,
        });
      }
      const trade = requireFunction(
        manager[decision.side],
        `MarketManager.${decision.side}`,
      );
      Reflect.apply(setMultiplier, manager, [decision.multiplier]);
      for (let index = 0; index < decision.repetitions; index++) {
        Reflect.apply(trade, manager, [resource]);
      }
      return SUCCEEDED;
    },
  });
}
