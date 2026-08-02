import type {
  GalaxyMarketDecision,
  GalaxyMarketInput,
  GalaxyMarketOfferInput,
} from "../../../../domain/economy/market/galaxy-market.ts";
import type { DecisionExecutor } from "../../../../ports/decision-executor.ts";
import type { GalaxyMarketReader } from "../../../../ports/galaxy-market.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import {
  callBoolean,
  callNumber,
  requireCount,
  requireFunction,
  requireNonEmptyString,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../../../validation.ts";

interface OfferIdentity {
  readonly buyResourceId: string;
  readonly sellResourceId: string;
}

interface GalaxyMarketSession {
  readonly manager: UnknownRecord;
  readonly offers: readonly OfferIdentity[];
}

export interface GalaxyMarketAdapterDependencies {
  // TRANSITIONAL: GalaxyTradeManager remains the narrow bridge to the current
  // galaxyTrade Vue controls until the Milestone 5 game adapter replaces it.
  readonly getManager: () => unknown;
  readonly getOffers: () => unknown;
  readonly getResources: () => unknown;
  readonly getSettings: () => unknown;
}

function optionalWeighting(resource: UnknownRecord, path: string): number {
  const value = resource["galaxyMarketWeighting"];
  return value === undefined || value === null
    ? 0
    : requireNumber(value, `${path}.galaxyMarketWeighting`);
}

function readOfferIdentity(value: unknown, path: string): OfferIdentity {
  const offer = requireRecord(value, path);
  const buy = requireRecord(offer["buy"], `${path}.buy`);
  const sell = requireRecord(offer["sell"], `${path}.sell`);
  return Object.freeze({
    buyResourceId: requireNonEmptyString(buy["res"], `${path}.buy.res`),
    sellResourceId: requireNonEmptyString(sell["res"], `${path}.sell.res`),
  });
}

function emptyInput(): GalaxyMarketInput {
  return Object.freeze({
    initialized: false,
    maximum: 0,
    minimumIngredientRatio: 0,
    offers: Object.freeze([]),
  });
}

export function createGalaxyMarketAdapter(
  dependencies: GalaxyMarketAdapterDependencies,
): {
  readonly reader: GalaxyMarketReader;
  readonly executor: DecisionExecutor<GalaxyMarketDecision>;
} {
  let session: GalaxyMarketSession | null = null;

  const reader: GalaxyMarketReader = Object.freeze({
    read(): GalaxyMarketInput {
      const manager = requireRecord(
        dependencies.getManager(),
        "GalaxyTradeManager",
      );
      const resources = requireRecord(dependencies.getResources(), "resources");
      const settings = requireRecord(dependencies.getSettings(), "settings");
      if (!callBoolean(manager, "initIndustry", "GalaxyTradeManager")) {
        session = null;
        return emptyInput();
      }
      const rawOffers = dependencies.getOffers();
      if (!Array.isArray(rawOffers)) {
        throw new TypeError("galaxyOffers must be an array");
      }
      const identities = rawOffers.map((offer, index) =>
        readOfferIdentity(offer, `galaxyOffers[${index}]`),
      );
      const partial = identities.map((identity, index) => {
        const buy = requireRecord(
          resources[identity.buyResourceId],
          `resources.${identity.buyResourceId}`,
        );
        const sell = requireRecord(
          resources[identity.sellResourceId],
          `resources.${identity.sellResourceId}`,
        );
        const weighting = optionalWeighting(
          buy,
          `resources.${identity.buyResourceId}`,
        );
        if (weighting <= 0) {
          return {
            identity,
            index,
            buy,
            sell,
            weighting,
            priority: 0,
            demanded: false,
          };
        }
        return {
          identity,
          index,
          buy,
          sell,
          weighting,
          priority: requireNumber(
            buy["galaxyMarketPriority"],
            `resources.${identity.buyResourceId}.galaxyMarketPriority`,
          ),
          demanded: callBoolean(
            buy,
            "isDemanded",
            `resources.${identity.buyResourceId}`,
          ),
        };
      });
      const maximum = requireCount(
        callNumber(manager, "maxOperating", "GalaxyTradeManager"),
        "GalaxyTradeManager.maxOperating()",
      );
      const hasActive =
        maximum > 0 &&
        partial.some((entry) => {
          const effectivePriority = entry.demanded
            ? Math.max(entry.priority, 100)
            : entry.priority;
          return entry.weighting > 0 && effectivePriority !== 0;
        });
      const minimumIngredientRatio = hasActive
        ? requireNumber(
            settings["marketMinIngredients"],
            "settings.marketMinIngredients",
          )
        : 0;
      const offers: GalaxyMarketOfferInput[] = partial.map((entry) => {
        const effectivePriority = entry.demanded
          ? Math.max(entry.priority, 100)
          : entry.priority;
        const active =
          maximum > 0 && entry.weighting > 0 && effectivePriority !== 0;
        return Object.freeze({
          index: entry.index,
          buyResourceId: entry.identity.buyResourceId,
          sellResourceId: entry.identity.sellResourceId,
          weighting: entry.weighting,
          priority: entry.priority,
          demanded: entry.demanded,
          useful: active
            ? callBoolean(
                entry.buy,
                "isUseful",
                `resources.${entry.identity.buyResourceId}`,
              )
            : false,
          sellDemanded: active
            ? callBoolean(
                entry.sell,
                "isDemanded",
                `resources.${entry.identity.sellResourceId}`,
              )
            : false,
          sellStorageRatio: active
            ? requireNumber(
                entry.sell["storageRatio"],
                `resources.${entry.identity.sellResourceId}.storageRatio`,
              )
            : 0,
          current: requireCount(
            callNumber(
              manager,
              "currentProduction",
              "GalaxyTradeManager",
              entry.index,
            ),
            `GalaxyTradeManager.currentProduction(${entry.index})`,
          ),
        });
      });
      session = Object.freeze({
        manager,
        offers: Object.freeze(identities),
      });
      return Object.freeze({
        initialized: true,
        maximum,
        minimumIngredientRatio,
        offers: Object.freeze(offers),
      });
    },
  });

  const executor: DecisionExecutor<GalaxyMarketDecision> = Object.freeze({
    execute(decision: Readonly<GalaxyMarketDecision>) {
      if (
        !Number.isSafeInteger(decision.expectedMaximum) ||
        decision.expectedMaximum < 0
      ) {
        return rejected(
          "invalid-galaxy-market-maximum",
          "galaxy-market maximum must be a non-negative safe integer",
        );
      }
      const indices = new Set<number>();
      for (const adjustment of decision.adjustments) {
        if (
          !Number.isSafeInteger(adjustment.offerIndex) ||
          adjustment.offerIndex < 0 ||
          indices.has(adjustment.offerIndex) ||
          typeof adjustment.buyResourceId !== "string" ||
          adjustment.buyResourceId.length === 0 ||
          typeof adjustment.sellResourceId !== "string" ||
          adjustment.sellResourceId.length === 0 ||
          !Number.isSafeInteger(adjustment.expectedCurrent) ||
          adjustment.expectedCurrent < 0 ||
          !Number.isSafeInteger(adjustment.delta) ||
          !Number.isSafeInteger(
            adjustment.expectedCurrent + adjustment.delta,
          ) ||
          adjustment.expectedCurrent + adjustment.delta < 0
        ) {
          return rejected(
            "invalid-galaxy-market-adjustment",
            "galaxy-market adjustments require unique indices and safe non-negative allocations",
          );
        }
        indices.add(adjustment.offerIndex);
      }
      const active = session;
      if (active === null) {
        return stale(
          "galaxy-market-session-missing",
          "Galaxy market read session is missing",
        );
      }
      const manager = requireRecord(
        dependencies.getManager(),
        "GalaxyTradeManager",
      );
      if (manager !== active.manager) {
        return stale(
          "galaxy-market-manager-changed",
          "Galaxy trade manager changed",
        );
      }
      if (
        requireCount(
          callNumber(manager, "maxOperating", "GalaxyTradeManager"),
          "GalaxyTradeManager.maxOperating()",
        ) !== decision.expectedMaximum
      ) {
        return stale(
          "galaxy-market-capacity-changed",
          "Galaxy market capacity changed",
        );
      }
      const rawOffers = dependencies.getOffers();
      if (
        !Array.isArray(rawOffers) ||
        rawOffers.length !== active.offers.length ||
        decision.adjustments.length !== active.offers.length
      ) {
        return stale(
          "galaxy-market-offers-changed",
          "Galaxy market offers changed",
        );
      }
      const currentProduction = requireFunction(
        manager["currentProduction"],
        "GalaxyTradeManager.currentProduction",
      );
      const decreaseProduction = decision.adjustments.some(
        (adjustment) => adjustment.delta < 0,
      )
        ? requireFunction(
            manager["decreaseProduction"],
            "GalaxyTradeManager.decreaseProduction",
          )
        : null;
      const increaseProduction = decision.adjustments.some(
        (adjustment) => adjustment.delta > 0,
      )
        ? requireFunction(
            manager["increaseProduction"],
            "GalaxyTradeManager.increaseProduction",
          )
        : null;
      for (let index = 0; index < rawOffers.length; index++) {
        const identity = readOfferIdentity(
          rawOffers[index],
          `galaxyOffers[${index}]`,
        );
        const expectedIdentity = active.offers[index];
        const adjustment = decision.adjustments[index];
        if (
          expectedIdentity === undefined ||
          adjustment === undefined ||
          adjustment.offerIndex !== index ||
          identity.buyResourceId !== expectedIdentity.buyResourceId ||
          identity.sellResourceId !== expectedIdentity.sellResourceId ||
          adjustment.buyResourceId !== expectedIdentity.buyResourceId ||
          adjustment.sellResourceId !== expectedIdentity.sellResourceId
        ) {
          return stale(
            "galaxy-market-offers-changed",
            "Galaxy market offer order changed",
          );
        }
        const actual = requireCount(
          Reflect.apply(currentProduction, manager, [index]),
          `GalaxyTradeManager.currentProduction(${index})`,
        );
        if (actual !== adjustment.expectedCurrent) {
          return stale(
            "galaxy-market-allocation-changed",
            "Galaxy market allocation changed",
            { offerIndex: index, expected: adjustment.expectedCurrent, actual },
          );
        }
      }
      for (const adjustment of decision.adjustments) {
        if (adjustment.delta < 0 && decreaseProduction !== null) {
          Reflect.apply(decreaseProduction, manager, [
            adjustment.offerIndex,
            adjustment.delta * -1,
          ]);
        }
      }
      for (const adjustment of decision.adjustments) {
        if (adjustment.delta > 0 && increaseProduction !== null) {
          Reflect.apply(increaseProduction, manager, [
            adjustment.offerIndex,
            adjustment.delta,
          ]);
        }
      }
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}
