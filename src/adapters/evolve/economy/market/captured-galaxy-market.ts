import type {
  GalaxyMarketDecision,
  GalaxyMarketInput,
  GalaxyMarketOfferInput,
} from "../../../../domain/economy/market/galaxy-market.ts";
import type { DecisionExecutor } from "../../../../ports/decision-executor.ts";
import type { GalaxyMarketReader } from "../../../../ports/galaxy-market.ts";
import type { GameControlHandle } from "../../../../ports/game-control-registry.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { isRecord, readProperty } from "../../../validation.ts";

export const GALAXY_MARKET_CONTROL = "galaxyTrade";

interface CapturedGalaxyMarketDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readDemand?: () => {
    readonly isDemanded: (resourceId: string) => boolean;
  };
}

interface OfferIdentity {
  readonly buyResourceId: string;
  readonly sellResourceId: string;
}

interface GalaxyMarketSession {
  readonly root: unknown;
  readonly control: GameControlHandle;
  readonly maximum: number;
  readonly offers: readonly OfferIdentity[];
}

// DeadSpace's exported galaxyOffers() is a fixed nine-route catalog. Keep only its identities at
// this boundary; route volumes belong to the game's period calculation and are not needed to click
// the route controls. The sixth sell resource is the one upstream race-dependent exception.
const BASE_OFFERS: readonly Readonly<{
  readonly buyResourceId: string;
  readonly sellResourceId?: string;
}>[] = Object.freeze([
  Object.freeze({ buyResourceId: "Deuterium", sellResourceId: "Helium_3" }),
  Object.freeze({
    buyResourceId: "Neutronium",
    sellResourceId: "Copper",
  }),
  Object.freeze({
    buyResourceId: "Adamantite",
    sellResourceId: "Iron",
  }),
  Object.freeze({
    buyResourceId: "Elerium",
    sellResourceId: "Oil",
  }),
  Object.freeze({
    buyResourceId: "Nano_Tube",
    sellResourceId: "Titanium",
  }),
  Object.freeze({ buyResourceId: "Graphene" }),
  Object.freeze({
    buyResourceId: "Stanene",
    sellResourceId: "Aluminium",
  }),
  Object.freeze({
    buyResourceId: "Bolognium",
    sellResourceId: "Uranium",
  }),
  Object.freeze({
    buyResourceId: "Vitreloy",
    sellResourceId: "Infernite",
  }),
]);

function capturedGalaxyFinite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readRouteCount(value: unknown): number | undefined {
  return capturedGalaxyFinite(value) !== undefined &&
    Number.isSafeInteger(value) &&
    (value as number) >= 0
    ? (value as number)
    : undefined;
}

function capturedGalaxySettingsRecord(
  value: unknown,
): Record<PropertyKey, unknown> {
  return isRecord(value) ? value : {};
}

function capturedGalaxySettingNumber(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: number,
): number {
  const value = capturedGalaxyFinite(settings[key]);
  return value === undefined ? fallback : value;
}

function capturedGalaxyOfferIdentities(
  root: unknown,
): readonly OfferIdentity[] {
  const race = readProperty(root, "race");
  const sellResourceId = readProperty(race, "smoldering")
    ? "Chrysotile"
    : readProperty(race, "kindling_kindred")
      ? "Stone"
      : "Lumber";
  return Object.freeze(
    BASE_OFFERS.map((offer) =>
      Object.freeze({
        buyResourceId: offer.buyResourceId,
        sellResourceId: offer.sellResourceId ?? sellResourceId,
      }),
    ),
  );
}

function capturedGalaxyEmptyInput(): GalaxyMarketInput {
  return Object.freeze({
    initialized: false,
    maximum: 0,
    minimumIngredientRatio: 0,
    offers: Object.freeze([]),
  });
}

function capturedGalaxyStorageRatio(
  resource: Record<PropertyKey, unknown>,
): number | undefined {
  const amount = capturedGalaxyFinite(resource["amount"]);
  const maximum = capturedGalaxyFinite(resource["max"]);
  if (amount === undefined || maximum === undefined) return undefined;
  return maximum > 0 ? amount / maximum : 1;
}

function capturedGalaxyUseful(
  resource: Record<PropertyKey, unknown>,
  resourceId: string,
  settings: Record<PropertyKey, unknown>,
  demanded: (resourceId: string) => boolean,
): boolean {
  // The upstream entity also considers eject/supply rate modifiers. Those are not in the
  // captured resource record yet, so this slice uses only terms reconstructed from the shared
  // demand sample and captured storage settings; it must never invent those missing signals.
  const ratio = capturedGalaxyStorageRatio(resource);
  if (ratio === undefined) return false;
  const overflow = settings[`res_storage_o_${resourceId}`] === true;
  const maxStorage = capturedGalaxyFinite(
    settings[`res_max_store${resourceId}`],
  );
  const amount = capturedGalaxyFinite(resource["amount"]);
  return (
    ratio < 0.99 ||
    demanded(resourceId) ||
    (overflow &&
      maxStorage !== undefined &&
      amount !== undefined &&
      amount < maxStorage)
  );
}

function capturedGalaxyReadTrade(root: unknown):
  | {
      readonly trade: Record<PropertyKey, unknown>;
      readonly maximum: number;
      readonly current: readonly number[];
    }
  | undefined {
  const galaxy = readProperty(root, "galaxy");
  const trade = readProperty(galaxy, "trade");
  if (!isRecord(trade)) return undefined;
  const maximum = readRouteCount(trade["max"]);
  const current = BASE_OFFERS.map((_, index) =>
    readRouteCount(trade[`f${index}`]),
  );
  const currentValues = current.filter(
    (value): value is number => value !== undefined,
  );
  const total = readRouteCount(trade["cur"]);
  if (
    maximum === undefined ||
    total === undefined ||
    currentValues.length !== current.length ||
    total !== currentValues.reduce((sum, value) => sum + value, 0) ||
    total > maximum
  ) {
    return undefined;
  }
  return Object.freeze({
    trade,
    maximum,
    current: Object.freeze(currentValues),
  });
}

export function createCapturedGalaxyMarketPorts(
  dependencies: CapturedGalaxyMarketDependencies,
): {
  readonly reader: GalaxyMarketReader;
  readonly executor: DecisionExecutor<GalaxyMarketDecision>;
} {
  let session: GalaxyMarketSession | null = null;

  const reader: GalaxyMarketReader = Object.freeze({
    read(): GalaxyMarketInput {
      const root = dependencies.rootState.readRoot();
      const control = dependencies.controls.resolve(GALAXY_MARKET_CONTROL);
      const trade = capturedGalaxyReadTrade(root);
      if (
        control === undefined ||
        !control.methods.includes("less") ||
        !control.methods.includes("more") ||
        trade === undefined
      ) {
        session = null;
        return capturedGalaxyEmptyInput();
      }
      const resources = readProperty(root, "resource");
      if (!isRecord(resources)) {
        session = null;
        return capturedGalaxyEmptyInput();
      }
      const settings = capturedGalaxySettingsRecord(
        dependencies.readSettings(),
      );
      const demanded = dependencies.readDemand?.() ?? {
        isDemanded: () => false,
      };
      const identities = capturedGalaxyOfferIdentities(root);
      const offers: GalaxyMarketOfferInput[] = [];
      for (const [index, identity] of identities.entries()) {
        const buy = readProperty(resources, identity.buyResourceId);
        const sell = readProperty(resources, identity.sellResourceId);
        if (!isRecord(buy) || !isRecord(sell)) {
          session = null;
          return capturedGalaxyEmptyInput();
        }
        const weighting = capturedGalaxySettingNumber(
          settings,
          `res_galaxy_w_${identity.buyResourceId}`,
          0,
        );
        const priority = capturedGalaxySettingNumber(
          settings,
          `res_galaxy_p_${identity.buyResourceId}`,
          0,
        );
        const active = weighting > 0 && priority !== 0 && trade.maximum > 0;
        const sellRatio = capturedGalaxyStorageRatio(sell);
        if (sellRatio === undefined) {
          session = null;
          return capturedGalaxyEmptyInput();
        }
        offers.push(
          Object.freeze({
            index,
            buyResourceId: identity.buyResourceId,
            sellResourceId: identity.sellResourceId,
            weighting,
            priority,
            demanded: active
              ? demanded.isDemanded(identity.buyResourceId)
              : false,
            useful: active
              ? capturedGalaxyUseful(
                  buy,
                  identity.buyResourceId,
                  settings,
                  demanded.isDemanded,
                )
              : false,
            sellDemanded: active
              ? demanded.isDemanded(identity.sellResourceId)
              : false,
            sellStorageRatio: active ? sellRatio : 0,
            current: trade.current[index] ?? 0,
          }),
        );
      }
      const hasActive = offers.some(
        (offer) =>
          offer.weighting > 0 &&
          (offer.demanded ? Math.max(offer.priority, 100) : offer.priority) !==
            0,
      );
      session = Object.freeze({
        root,
        control,
        maximum: trade.maximum,
        offers: identities,
      });
      return Object.freeze({
        initialized: true,
        maximum: trade.maximum,
        minimumIngredientRatio: hasActive
          ? capturedGalaxySettingNumber(settings, "marketMinIngredients", 0)
          : 0,
        offers: Object.freeze(offers),
      });
    },
  });

  const executor: DecisionExecutor<GalaxyMarketDecision> = Object.freeze({
    execute(decision: Readonly<GalaxyMarketDecision>) {
      const active = session;
      if (active === null) {
        return stale(
          "captured-galaxy-market-session-missing",
          "galaxy market sample is unavailable",
        );
      }
      if (
        !Number.isSafeInteger(decision.expectedMaximum) ||
        decision.expectedMaximum !== active.maximum ||
        decision.adjustments.length !== active.offers.length
      ) {
        return rejected(
          "invalid-captured-galaxy-market-decision",
          "galaxy market decision does not match the captured session",
        );
      }
      if (dependencies.rootState.readRoot() !== active.root) {
        return stale(
          "captured-galaxy-market-root-changed",
          "captured game root changed",
        );
      }
      const control = dependencies.controls.resolve(GALAXY_MARKET_CONTROL);
      if (
        control === undefined ||
        control.generation !== active.control.generation
      ) {
        return stale(
          "captured-galaxy-market-control-changed",
          "galaxy market control changed",
        );
      }
      const trade = capturedGalaxyReadTrade(active.root);
      if (trade === undefined || trade.maximum !== active.maximum) {
        return stale(
          "captured-galaxy-market-state-changed",
          "galaxy market allocation changed",
        );
      }
      for (const [index, adjustment] of decision.adjustments.entries()) {
        const identity = active.offers[index];
        if (
          identity === undefined ||
          adjustment.offerIndex !== index ||
          adjustment.buyResourceId !== identity.buyResourceId ||
          adjustment.sellResourceId !== identity.sellResourceId ||
          !Number.isSafeInteger(adjustment.expectedCurrent) ||
          adjustment.expectedCurrent !== trade.current[index] ||
          !Number.isSafeInteger(adjustment.delta) ||
          adjustment.expectedCurrent + adjustment.delta < 0
        ) {
          return stale(
            "captured-galaxy-market-allocation-changed",
            "galaxy market allocation changed",
          );
        }
      }
      const invoke = (method: "less" | "more", index: number): boolean => {
        const result = dependencies.controls.invoke(control, method, [index]);
        return result.ok;
      };
      for (const adjustment of decision.adjustments) {
        if (adjustment.delta < 0) {
          for (let index = 0; index < -adjustment.delta; index += 1) {
            if (!invoke("less", adjustment.offerIndex)) {
              return rejected(
                "captured-galaxy-market-control-failed",
                "galaxy market decrement failed",
              );
            }
          }
        }
      }
      for (const adjustment of decision.adjustments) {
        if (adjustment.delta > 0) {
          for (let index = 0; index < adjustment.delta; index += 1) {
            if (!invoke("more", adjustment.offerIndex)) {
              return rejected(
                "captured-galaxy-market-control-failed",
                "galaxy market increment failed",
              );
            }
          }
        }
      }
      const finalTrade = capturedGalaxyReadTrade(active.root);
      if (
        finalTrade === undefined ||
        decision.adjustments.some(
          (adjustment, index) =>
            finalTrade.current[index] !==
            adjustment.expectedCurrent + adjustment.delta,
        )
      ) {
        return rejected(
          "captured-galaxy-market-unchanged",
          "galaxy market allocation did not match the requested change",
        );
      }
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}
