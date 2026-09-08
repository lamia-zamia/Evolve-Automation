/**
 * The first captured slice of the script's own resource-demand model.
 *
 * `isDemanded` is what most of the remaining features are waiting on: it is how crafting, the
 * production splits, storage and the market learn that something else is accumulating a resource.
 * It is not upstream state — the game does not compute it — so it has to be planned here, from the
 * commitments the captured runtime can actually see.
 *
 * This sample is deliberately narrow. It carries the player's own build and research queues, priced
 * through the game's own cost code by the existing captured reservation source, which already
 * applies the game's rule for which queue entries it is saving for, and the construction cycle's own
 * saving target — the highest-weighted candidate it wants but cannot yet afford, observed from the
 * cycle that has already run. It carries nothing else yet: no script triggers, no missions, no
 * crafters, no factory or fleet demand. Those belong to features this runtime has not migrated.
 *
 * A missing part of the model can only leave a resource looking undemanded, never demand something
 * nothing wants, so every consumer degrades the same way the bounded slices already do.
 */

import {
  planDemandPrioritization,
  type DemandCost,
  type DemandPrioritizationSettings,
  type DemandTarget,
} from "../../../../domain/economy/resources/demand-prioritization.ts";
import type { ReservedCostTarget } from "../../../../domain/cost-conflicts.ts";
import type { CostReservationSource } from "../../../../ports/game-cost-reservations.ts";
import type { ConstructionObservations } from "../../../../ports/game-construction-observations.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { isRecord, readProperty } from "../../../validation.ts";

export interface CapturedResourceDemandDependencies {
  readonly rootState: GameRootStateSource;
  readonly reservations: CostReservationSource;
  /**
   * What the construction cycle observed. Absent for a caller with no construction cycle to watch,
   * which then simply sees no implicit commitment.
   */
  readonly construction?: ConstructionObservations;
  readonly readSettings: () => unknown;
}

export interface CapturedDemandSample {
  /** How much of a resource the queues are accumulating, clamped to what storage can hold. */
  requestedQuantity(resourceId: string): number;
  /** The script's `isDemanded`: something wants more of this than the player currently has. */
  isDemanded(resourceId: string): boolean;
}

export interface CapturedResourceDemand {
  /** Plans the demand for one cycle. Callers sample once and share the result. */
  sample(): CapturedDemandSample;
}

const EMPTY_SAMPLE: CapturedDemandSample = Object.freeze({
  requestedQuantity: () => 0,
  isDemanded: () => false,
});

function settingString(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: string,
): string {
  const value = settings[key];
  return typeof value === "string" ? value : fallback;
}

function settingBoolean(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = settings[key];
  return typeof value === "boolean" ? value : fallback;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readSettingsInput(
  settingsValue: unknown,
): DemandPrioritizationSettings {
  const settings = isRecord(settingsValue) ? settingsValue : {};
  return Object.freeze({
    prioritizeQueue: settingString(settings, "prioritizeQueue", "savereq"),
    prioritizeTriggers: settingString(
      settings,
      "prioritizeTriggers",
      "savereq",
    ),
    missionRequest: settingBoolean(settings, "missionRequest", true),
    prestigeBioseedConstruct: settingBoolean(
      settings,
      "prestigeBioseedConstruct",
      false,
    ),
    prestigeType: settingString(settings, "prestigeType", "none"),
    researchRequest: settingBoolean(settings, "researchRequest", true),
    researchRequestSpace: settingBoolean(
      settings,
      "researchRequestSpace",
      false,
    ),
    prioritizeUnify: settingString(settings, "prioritizeUnify", "savereq"),
    autoFleet: settingBoolean(settings, "autoFleet", false),
    prioritizeOuterFleet: settingString(
      settings,
      "prioritizeOuterFleet",
      "ignore",
    ),
    productionFactoryFocusMaterials: settingBoolean(
      settings,
      "productionFactoryFocusMaterials",
      false,
    ),
    autoPower: settingBoolean(settings, "autoPower", false),
    productionFactoryMinIngredients:
      finite(settings["productionFactoryMinIngredients"]) ?? 0,
  });
}

/**
 * A reserved queue entry as a demand target. The reservation source reports the cost the game
 * would pay, not whether the entry is an A.R.P.A. project part-way through, so no target claims the
 * project cost doubling; an under-stated demand is the safe direction here.
 */
function toCosts(
  cost: Readonly<Record<string, number | undefined>>,
): readonly DemandCost[] {
  return Object.freeze(
    Object.entries(cost).flatMap(([resourceId, amount]) => {
      const value = finite(amount);
      return value === undefined
        ? []
        : [Object.freeze({ resourceId, amount: value })];
    }),
  );
}

function toTargets(
  targets: readonly Readonly<ReservedCostTarget>[],
): readonly DemandTarget[] {
  return Object.freeze(
    targets.map((target) =>
      Object.freeze({
        isProject: false,
        progress: null,
        costs: toCosts(target.cost),
      }),
    ),
  );
}

export function createCapturedResourceDemand(
  dependencies: CapturedResourceDemandDependencies,
): CapturedResourceDemand {
  return Object.freeze({
    sample(): CapturedDemandSample {
      const root = dependencies.rootState.readRoot();
      const resources = readProperty(root, "resource");
      if (!isRecord(resources)) return EMPTY_SAMPLE;
      const queued = dependencies.reservations.readReservations().targets;
      const saving = dependencies.construction?.readSavingTarget() ?? null;
      if (queued.length === 0 && saving === null) return EMPTY_SAMPLE;

      const result = planDemandPrioritization({
        settings: readSettingsInput(dependencies.readSettings()),
        // Only reachable through the research fallback, which has no technologies to offer in this
        // bounded sample and therefore returns the same empty list either way.
        isEarlyGame: false,
        consumptionBalanceTarget: 0,
        truepathAiBuildingTarget: null,
        inflationMoney: null,
        retirementGraphene: null,
        queuedTargets: toTargets(queued),
        triggerTargets: Object.freeze([]),
        savingTarget:
          saving === null
            ? null
            : Object.freeze({
                name: saving.name,
                costs: toCosts(saving.cost),
              }),
        missions: Object.freeze([]),
        unlockedTechs: Object.freeze([]),
        spyPurchaseMoney: 0,
        fleet: Object.freeze({
          nextShipAffordable: false,
          nextShipCost: Object.freeze([]),
        }),
        availableCrafters: 0,
        crafters: Object.freeze([]),
        vitreloyPlant: Object.freeze({
          autoStateEnabled: false,
          count: 0,
          stateOnCount: 0,
        }),
        factoryCount: 0,
        factoryProductions: Object.freeze([]),
      });

      // The script's own `requestQuantity`: requests combine by maximum, and none can exceed what
      // the resource's storage holds.
      const requested = new Map<string, number>();
      for (const request of result.requests) {
        const amount = finite(request.amount);
        if (amount === undefined) continue;
        const current = requested.get(request.resourceId) ?? 0;
        if (amount <= current) continue;
        const maximum = finite(
          readProperty(readProperty(resources, request.resourceId), "max"),
        );
        requested.set(
          request.resourceId,
          maximum === undefined || maximum < 0
            ? amount
            : Math.min(amount, maximum),
        );
      }

      return Object.freeze({
        requestedQuantity: (resourceId: string) =>
          requested.get(resourceId) ?? 0,
        isDemanded: (resourceId: string) => {
          const wanted = requested.get(resourceId);
          if (wanted === undefined) return false;
          const amount = finite(
            readProperty(readProperty(resources, resourceId), "amount"),
          );
          return amount !== undefined && wanted > amount;
        },
      });
    },
  });
}
