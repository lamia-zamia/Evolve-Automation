/**
 * Captured adapter for the game's manual gathering actions.
 *
 * The planner remains the existing pure gather policy. This adapter samples only the resource and
 * race/technology fields it needs, then invokes the game's own captured `action` method. It never
 * calls an action definition directly and never writes a predicted quantity back into the live
 * root; the root is the authority after every click.
 */

import type {
  GatherActionId,
  GatherResourceAssignment,
  GatherResourceId,
  GatherResourcesDecision,
  GatherResourcesInput,
} from "../../../../domain/economy/resources/gather-resources.ts";
import {
  planResourceClaimLedger,
  readAdmittedResourceClaim,
  type ResourceClaimFreshness,
  type ResourceClaimReservation,
} from "../../../../domain/economy/resources/resource-claims.ts";
import type { DecisionExecutor } from "../../../../ports/decision-executor.ts";
import type { GatherResourcesReader } from "../../../../ports/gather-resources.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { isRecord, readProperty } from "../../../validation.ts";

declare const __EA_TEST_SURFACE_ENABLED__: boolean;

const ACTION_ORDER: readonly GatherActionId[] = Object.freeze([
  "food",
  "lumber",
  "stone",
  "chrysotile",
  "slaughter",
]);

const CONTROL_IDS: Readonly<Record<GatherActionId, readonly string[]>> =
  Object.freeze({
    // DeadSpace's two buildTemplate call sites still declare these ids with an undefined region.
    // The action's own selector is authoritative, so accept both upstream shapes.
    food: Object.freeze(["city-food", "undefined-food"]),
    lumber: Object.freeze(["city-lumber"]),
    stone: Object.freeze(["city-stone", "undefined-stone"]),
    chrysotile: Object.freeze(["city-chrysotile"]),
    slaughter: Object.freeze(["city-slaughter"]),
  });

const DEFAULT_CLICK_LIMIT = 50;

interface ResourceState {
  readonly currentQuantity: number;
  readonly maxQuantity: number;
}

interface CapturedGatherSession {
  readonly root: unknown;
  readonly resourceClaimLedger:
    ReturnType<typeof planResourceClaimLedger> | undefined;
  readonly foodConjuring: boolean;
  readonly materialConjuring: boolean;
  readonly manaQuantity: number;
}

export interface CapturedGatherResourcesDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  /** Script settings have already crossed storage as unknown and are validated here. */
  readonly readSettings: () => unknown;
  readonly onSkipped?: (key: string, reason: string) => void;
  /** Test-surface-only intervention read by the existing Gather owner. */
  readonly readTestIntervention?: () => unknown;
}

function numberValue(value: unknown): number {
  return Number(value);
}

function readResource(
  root: unknown,
  id: GatherResourceId | "Population",
): ResourceState {
  const resource = readProperty(readProperty(root, "resource"), id);
  return Object.freeze({
    // Resources are lazily populated by the game; Number(undefined) preserves the existing
    // planner's NaN comparison behavior instead of inventing an unlocked resource.
    currentQuantity: numberValue(readProperty(resource, "amount")),
    maxQuantity: numberValue(readProperty(resource, "max")),
  });
}

function readTechLevel(root: unknown, id: string): number {
  const level = numberValue(readProperty(readProperty(root, "tech"), id));
  // DeadSpace omits unresearched technology keys; treat an absent grant as level zero.
  return Number.isNaN(level) ? 0 : level;
}

function readStrongMultiplier(root: unknown): number {
  const rank = readProperty(readProperty(root, "race"), "strong");
  if (rank !== true && (typeof rank !== "number" || rank === 0)) return 1;
  const candidate = rank === true ? 1 : rank;
  const normalized = Math.max(
    0.1,
    Math.min(
      Number.isFinite(candidate) && candidate !== 0 ? candidate : 1,
      2.4,
    ),
  );
  const lowRank = normalized < 1;
  const fraction = lowRank
    ? (normalized - 0.1) / 0.9
    : normalized <= 2
      ? normalized - 1
      : 1 + (normalized - 2) / 2;
  const lower = lowRank ? 2 : 4;
  const upper = lowRank ? 4 : 7;

  // Mirrors pinned races.js traitScale()/traits.strong.vars()[0] for manual gathering.
  return Number((lower + (upper - lower) * fraction).toFixed(6));
}

function readControl(
  controls: GameControlRegistry,
  actionId: GatherActionId,
): string | undefined {
  return CONTROL_IDS[actionId].find((elementId) => {
    const handle = controls.resolve(elementId);
    return handle !== undefined && handle.methods.includes("action");
  });
}

function emptyInput(): GatherResourcesInput {
  const empty = Object.freeze({ currentQuantity: 0, maxQuantity: 0 });
  return Object.freeze({
    stopped: true,
    resourcesPerClick: 1,
    clickLimit: 0,
    fasting: false,
    soulEater: false,
    primitive: false,
    foodConjuring: false,
    materialConjuring: false,
    fursUnlocked: false,
    clickable: Object.freeze({
      food: false,
      lumber: false,
      stone: false,
      chrysotile: false,
      slaughter: false,
    }),
    resources: Object.freeze({
      Food: empty,
      Lumber: empty,
      Stone: empty,
      Chrysotile: empty,
      Furs: empty,
      Mana: empty,
    }),
  });
}

function currentQuantity(root: unknown, resourceId: GatherResourceId): number {
  return readResource(root, resourceId).currentQuantity;
}

function readClaimFreshness(
  value: unknown,
): ResourceClaimFreshness | undefined {
  const rootGeneration = readProperty(value, "rootGeneration");
  const progressionGeneration = readProperty(value, "progressionGeneration");
  const offerGeneration = readProperty(value, "offerGeneration");
  return typeof rootGeneration === "number" &&
    Number.isSafeInteger(rootGeneration) &&
    typeof progressionGeneration === "string" &&
    progressionGeneration.length > 0 &&
    typeof offerGeneration === "number" &&
    Number.isSafeInteger(offerGeneration)
    ? Object.freeze({ rootGeneration, progressionGeneration, offerGeneration })
    : undefined;
}

function readClaimReservations(
  value: unknown,
): readonly Readonly<ResourceClaimReservation>[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const reservations: ResourceClaimReservation[] = [];
  for (const entry of value) {
    const resourceId = readProperty(entry, "resourceId");
    const poolId = readProperty(entry, "poolId");
    const quantity = readProperty(entry, "quantity");
    if (
      typeof resourceId !== "string" ||
      typeof poolId !== "string" ||
      typeof quantity !== "number" ||
      !Number.isFinite(quantity) ||
      quantity < 0
    )
      return undefined;
    reservations.push(Object.freeze({ resourceId, poolId, quantity }));
  }
  return Object.freeze(reservations);
}

function hasQueueEntriesOrUnavailable(
  root: unknown,
  queueId: "queue" | "r_queue",
): boolean {
  const queue = readProperty(root, queueId);
  const entries = readProperty(queue, "queue");
  return !Array.isArray(entries) || entries.length > 0;
}

function assignmentsMatch(
  root: unknown,
  assignments: readonly Readonly<GatherResourceAssignment>[],
  useQuantity: boolean,
): boolean {
  return assignments.every((assignment) => {
    const actual = currentQuantity(root, assignment.resourceId);
    const expected = useQuantity
      ? assignment.quantity
      : assignment.expectedQuantity;
    return actual === expected;
  });
}

function readClickLimit(
  settings: Record<PropertyKey, unknown>,
  onSkipped: (key: string, reason: string) => void,
): number | undefined {
  const value = settings["buildingClickPerTick"];
  if (value === undefined) return DEFAULT_CLICK_LIMIT;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  onSkipped(
    "gather",
    "buildingClickPerTick is not a non-negative safe integer",
  );
  return undefined;
}

export function createCapturedGatherResourcesAdapter({
  rootState,
  controls,
  readSettings,
  onSkipped,
  readTestIntervention,
}: CapturedGatherResourcesDependencies): {
  readonly reader: GatherResourcesReader;
  readonly executor: DecisionExecutor<GatherResourcesDecision>;
} {
  const reportSkipped = onSkipped ?? (() => {});
  let session: CapturedGatherSession | undefined;

  const reader: GatherResourcesReader = Object.freeze({
    read(): GatherResourcesInput {
      const root = rootState.readRoot();
      const settingsValue = readSettings();
      if (!isRecord(root) || !isRecord(settingsValue)) {
        session = undefined;
        return emptyInput();
      }
      const clickLimit = readClickLimit(settingsValue, reportSkipped);
      if (clickLimit === undefined) {
        session = undefined;
        return emptyInput();
      }

      const resources = Object.freeze({
        Food: readResource(root, "Food"),
        Lumber: readResource(root, "Lumber"),
        Stone: readResource(root, "Stone"),
        Chrysotile: readResource(root, "Chrysotile"),
        Furs: readResource(root, "Furs"),
        Mana: readResource(root, "Mana"),
      });
      const race = readProperty(root, "race");
      const city = readProperty(root, "city");
      const populationResource = readResource(root, "Population");
      const quarry = readProperty(city, "rock_quarry");
      const alwaysClick = settingsValue["buildingAlwaysClick"] === true;
      const stopped =
        !alwaysClick &&
        populationResource.currentQuantity > 15 &&
        (numberValue(readProperty(quarry, "count")) > 0 ||
          Boolean(readProperty(race, "sappy")));
      const controlsByAction = Object.freeze({
        food: readControl(controls, "food"),
        lumber: readControl(controls, "lumber"),
        stone: readControl(controls, "stone"),
        chrysotile: readControl(controls, "chrysotile"),
        slaughter: readControl(controls, "slaughter"),
      });
      const foodConjuring = readTechLevel(root, "conjuring") >= 1;
      const materialConjuring = readTechLevel(root, "conjuring") >= 2;
      let resourceClaimLedger:
        ReturnType<typeof planResourceClaimLedger> | undefined;
      if (
        typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
        __EA_TEST_SURFACE_ENABLED__ === true
      ) {
        const intervention = readTestIntervention?.();
        const claim = readAdmittedResourceClaim(
          readProperty(intervention, "resourceClaim"),
        );
        const freshness = readClaimFreshness(
          readProperty(intervention, "resourceClaimFreshness"),
        );
        const reservations = readClaimReservations(
          readProperty(intervention, "resourceClaimReservations"),
        );
        const claimStillRelevant =
          claim !== undefined &&
          settingsValue["prestigeType"] === "mad" &&
          settingsValue["autoResearch"] === true &&
          settingsValue["autoTrigger"] !== true &&
          !hasQueueEntriesOrUnavailable(root, "queue") &&
          !hasQueueEntriesOrUnavailable(root, "r_queue") &&
          readTechLevel(root, claim.targetGrantTechnology) <
            claim.targetGrantLevel;
        if (claimStillRelevant && claim !== undefined) {
          const currentClaim = readAdmittedResourceClaim({
            ...claim,
            observedStock: resources.Mana.currentQuantity,
            observedCapacity: resources.Mana.maxQuantity,
            nativeOfferCurrent: true,
            nativeActionEligible: true,
            researchPermission: true,
            queueEvidence: "empty",
            observationValid: true,
          });
          if (currentClaim !== undefined) {
            const currentFreshness =
              freshness ??
              Object.freeze({
                rootGeneration: -1,
                progressionGeneration: "unavailable",
                offerGeneration: -1,
              });
            resourceClaimLedger = planResourceClaimLedger({
              claims: [currentClaim],
              freshness: currentFreshness,
              stock: resources.Mana.currentQuantity,
              knownReservations: reservations,
              forecastProductionPerSecond:
                currentClaim.forecastProductionPerSecond,
            });
          }
        }
        const ledgerObserver = readProperty(
          intervention,
          "resourceClaimLedgerObserver",
        );
        if (typeof ledgerObserver === "function")
          ledgerObserver(
            resourceClaimLedger ??
              Object.freeze({
                status: "no-ledger",
                claimParsed: claim !== undefined,
                freshnessAvailable: freshness !== undefined,
                researchSelected: settingsValue["prestigeType"] === "mad",
                researchAllowed: settingsValue["autoResearch"] === true,
                triggersDisabled: settingsValue["autoTrigger"] !== true,
                constructionQueueActive: hasQueueEntriesOrUnavailable(
                  root,
                  "queue",
                ),
                researchQueueActive: hasQueueEntriesOrUnavailable(
                  root,
                  "r_queue",
                ),
                targetIncomplete:
                  claim !== undefined &&
                  readTechLevel(root, claim.targetGrantTechnology) <
                    claim.targetGrantLevel,
              }),
          );
      }
      const furs = readProperty(readProperty(root, "resource"), "Furs");
      const input = Object.freeze({
        stopped,
        resourcesPerClick: Number(
          (
            readStrongMultiplier(root) *
            (readProperty(readProperty(root, "genes"), "enhance") ? 2 : 1)
          ).toFixed(1),
        ),
        clickLimit,
        fasting: Boolean(readProperty(race, "fasting")),
        soulEater: Boolean(readProperty(race, "soul_eater")),
        primitive: readTechLevel(root, "primitive") >= 1,
        foodConjuring,
        materialConjuring,
        ...(resourceClaimLedger === undefined ? {} : { resourceClaimLedger }),
        fursUnlocked: Boolean(readProperty(furs, "display")),
        clickable: Object.freeze({
          food: controlsByAction.food !== undefined,
          lumber: controlsByAction.lumber !== undefined,
          stone: controlsByAction.stone !== undefined,
          chrysotile: controlsByAction.chrysotile !== undefined,
          slaughter: controlsByAction.slaughter !== undefined,
        }),
        resources,
      });
      session = Object.freeze({
        root,
        resourceClaimLedger,
        foodConjuring,
        materialConjuring,
        manaQuantity: resources.Mana.currentQuantity,
      });
      return input;
    },
  });

  const executor: DecisionExecutor<GatherResourcesDecision> = Object.freeze({
    execute(decision: Readonly<GatherResourcesDecision>) {
      const active = session;
      if (active === undefined) {
        return stale(
          "gather-session-missing",
          "gather read session is missing",
        );
      }
      if (rootState.readRoot() !== active.root) {
        return stale("gather-root-changed", "captured game root changed");
      }
      if (
        typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
        __EA_TEST_SURFACE_ENABLED__ === true
      ) {
        const intervention = readTestIntervention?.();
        const decisionObserver = readProperty(
          intervention,
          "resourceClaimDecisionObserver",
        );
        if (typeof decisionObserver === "function")
          decisionObserver(
            Object.freeze({
              ledgerStatus: active.resourceClaimLedger?.status ?? "none",
              spendableStock: active.resourceClaimLedger?.spendableStock,
              observedMana: active.manaQuantity,
              materialConjuring: active.materialConjuring,
              conjuringLevel: readTechLevel(active.root, "conjuring"),
              operations: Object.freeze(
                decision.operations.map((operation) =>
                  Object.freeze({
                    actionId: operation.actionId,
                    amount: operation.amount,
                  }),
                ),
              ),
            }),
          );
      }
      let previousIndex = -1;
      let remainingClaimSpend =
        active.resourceClaimLedger?.spendableStock ?? Infinity;
      let foodSafetyManaAllowance =
        active.resourceClaimLedger === undefined ? 0 : 1;
      for (const operation of decision.operations) {
        const actionIndex = ACTION_ORDER.indexOf(operation.actionId);
        if (
          actionIndex <= previousIndex ||
          !Number.isFinite(operation.amount) ||
          !Number.isSafeInteger(Math.ceil(operation.amount))
        ) {
          return rejected(
            "invalid-gather-operation",
            "gather operations must be finite and ordered",
          );
        }
        previousIndex = actionIndex;
        if (
          !assignmentsMatch(rootState.readRoot(), operation.beforeAction, false)
        ) {
          return stale(
            "gather-quantity-changed",
            `gather inputs changed before ${operation.actionId}`,
          );
        }
        const clickCount =
          operation.amount > 0 ? Math.ceil(operation.amount) : 0;
        if (clickCount > 0) {
          const elementId = readControl(controls, operation.actionId);
          if (elementId === undefined) {
            return rejected(
              "gather-control-missing",
              `no captured control for ${operation.actionId}`,
            );
          }
          const handle = controls.resolve(elementId);
          if (handle === undefined) {
            return stale(
              "gather-control-stale",
              `captured control disappeared for ${operation.actionId}`,
            );
          }
          for (let index = 0; index < operation.amount; index += 1) {
            const beforeClickRoot = rootState.readRoot();
            if (beforeClickRoot !== active.root) {
              return stale(
                "gather-root-changed",
                `captured game root changed before ${operation.actionId}`,
              );
            }
            const manaBefore = readResource(
              beforeClickRoot,
              "Mana",
            ).currentQuantity;
            const conjuring =
              operation.actionId === "food"
                ? active.foodConjuring
                : active.materialConjuring;
            const foodSafetyOverride =
              operation.actionId === "food" &&
              readResource(beforeClickRoot, "Food").currentQuantity <= 0;
            const expectedManaSpend = conjuring && manaBefore >= 1;
            if (
              active.resourceClaimLedger !== undefined &&
              expectedManaSpend &&
              remainingClaimSpend +
                (foodSafetyOverride ? foodSafetyManaAllowance : 0) <
                1
            ) {
              return stale(
                "gather-claim-budget-exhausted",
                `Mana claim budget was exhausted before ${operation.actionId}`,
              );
            }
            const result = controls.invoke(handle, "action");
            if (!result.ok) {
              return result.reason === "stale-control"
                ? stale("gather-control-stale", result.detail ?? result.reason)
                : rejected(
                    "gather-click-failed",
                    result.detail ?? result.reason,
                  );
            }
            if (active.resourceClaimLedger !== undefined) {
              const afterClickRoot = rootState.readRoot();
              if (afterClickRoot !== active.root) {
                return stale(
                  "gather-root-changed",
                  `captured game root changed after ${operation.actionId}`,
                );
              }
              const manaAfter = readResource(
                afterClickRoot,
                "Mana",
              ).currentQuantity;
              const actualManaSpend = manaBefore - manaAfter;
              if (
                !Number.isFinite(manaAfter) ||
                actualManaSpend < 0 ||
                (expectedManaSpend && Math.abs(actualManaSpend - 1) > 1e-9) ||
                (!expectedManaSpend && actualManaSpend > 1e-9)
              ) {
                return stale(
                  "gather-mana-postcondition",
                  `Mana changed unexpectedly after ${operation.actionId}`,
                );
              }
              const claimBudgetBeforeClick = remainingClaimSpend;
              const claimBudgetOverage = Math.max(
                0,
                actualManaSpend - claimBudgetBeforeClick,
              );
              const allowedSafetyOverage = foodSafetyOverride
                ? foodSafetyManaAllowance
                : 0;
              if (claimBudgetOverage > allowedSafetyOverage + 1e-9) {
                return stale(
                  "gather-claim-budget-exceeded",
                  `Mana claim budget was exceeded by ${operation.actionId}`,
                );
              }
              if (foodSafetyOverride)
                foodSafetyManaAllowance = Math.max(
                  0,
                  foodSafetyManaAllowance - claimBudgetOverage,
                );
              remainingClaimSpend = Math.max(
                0,
                claimBudgetBeforeClick - actualManaSpend,
              );
            }
          }
        }
        if (
          !assignmentsMatch(rootState.readRoot(), operation.afterAction, true)
        ) {
          return stale(
            "gather-result-changed",
            `gather result differed for ${operation.actionId}`,
          );
        }
      }
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}
