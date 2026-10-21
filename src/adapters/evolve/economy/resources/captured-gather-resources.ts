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
  type ResourceClaim,
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

const GATHER_BOOTSTRAP_TECHNOLOGY = "primitive";

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
  readonly testIntervention?: unknown;
  readonly testStandardResearchTarget?: TestStandardResearchTarget;
}

interface TestStandardResearchTarget {
  readonly actionId: "tech-sundial";
  readonly stonePrice: number;
  readonly clickBudget: number;
  readonly offerGeneration: number;
  readonly stoneControlGeneration: number;
  readonly isCurrent: () => boolean;
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

function readTestStandardResearchTarget(
  value: unknown,
): Omit<TestStandardResearchTarget, "stoneControlGeneration"> | undefined {
  const actionId = readProperty(value, "actionId");
  const stonePrice = readProperty(value, "stonePrice");
  const clickBudget = readProperty(value, "clickBudget");
  const offerGeneration = readProperty(value, "offerGeneration");
  const isCurrent = readProperty(value, "isCurrent");
  return actionId === "tech-sundial" &&
    typeof stonePrice === "number" &&
    Number.isFinite(stonePrice) &&
    stonePrice > 0 &&
    typeof clickBudget === "number" &&
    Number.isSafeInteger(clickBudget) &&
    clickBudget > 0 &&
    clickBudget <= 10 &&
    typeof offerGeneration === "number" &&
    Number.isSafeInteger(offerGeneration) &&
    offerGeneration > 0 &&
    typeof isCurrent === "function"
    ? Object.freeze({
        actionId,
        stonePrice,
        clickBudget,
        offerGeneration,
        isCurrent: isCurrent as () => boolean,
      })
    : undefined;
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
  const offerSetIdentity = readProperty(value, "offerSetIdentity");
  const offerObservationId = readProperty(value, "offerObservationId");
  return typeof rootGeneration === "number" &&
    Number.isSafeInteger(rootGeneration) &&
    typeof progressionGeneration === "string" &&
    progressionGeneration.length > 0 &&
    typeof offerSetIdentity === "string" &&
    offerSetIdentity.length > 0 &&
    typeof offerObservationId === "string" &&
    offerObservationId.length > 0
    ? Object.freeze({
        rootGeneration,
        progressionGeneration,
        offerSetIdentity,
        offerObservationId,
      })
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
      const alwaysClick = settingsValue["buildingAlwaysClick"] === true;
      const stopped =
        !alwaysClick && readTechLevel(root, GATHER_BOOTSTRAP_TECHNOLOGY) >= 1;
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
      let testIntervention: unknown;
      let testStandardResearchTarget: TestStandardResearchTarget | undefined;
      if (
        typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
        __EA_TEST_SURFACE_ENABLED__ === true
      ) {
        const intervention = readTestIntervention?.();
        testIntervention = intervention;
        const target = readTestStandardResearchTarget(
          readProperty(intervention, "standardResearchTarget"),
        );
        const stoneControlId = controlsByAction.stone;
        const stoneControl =
          stoneControlId === undefined
            ? undefined
            : controls.resolve(stoneControlId);
        const researchControl = controls.resolve("tech-sundial");
        if (
          target !== undefined &&
          stoneControlId !== undefined &&
          stoneControl?.methods.includes("action") === true &&
          researchControl?.methods.includes("action") === true &&
          researchControl.generation === target.offerGeneration &&
          target.isCurrent()
        )
          testStandardResearchTarget = Object.freeze({
            ...target,
            stoneControlGeneration: stoneControl.generation,
          });
        const claim = readAdmittedResourceClaim(
          readProperty(intervention, "resourceClaim"),
        );
        const rawClaims = readProperty(intervention, "resourceClaims");
        const claims = Array.isArray(rawClaims)
          ? rawClaims
              .map((value: unknown) => readAdmittedResourceClaim(value))
              .filter(
                (value): value is Readonly<ResourceClaim> =>
                  value !== undefined,
              )
          : claim === undefined
            ? []
            : [claim];
        const freshness = readClaimFreshness(
          readProperty(intervention, "resourceClaimFreshness"),
        );
        const reservations = readClaimReservations(
          readProperty(intervention, "resourceClaimReservations"),
        );
        const observationAvailable =
          readProperty(intervention, "resourceClaimObservationAvailable") ===
            true &&
          (!Array.isArray(rawClaims) || claims.length === rawClaims.length);
        const currentClaimControls = claims.map((currentClaim) =>
          controls.resolve(currentClaim.nativeActionId),
        );
        const currentControlBindings = currentClaimControls.flatMap(
          (currentControl) =>
            currentControl === undefined
              ? []
              : [
                  Object.freeze({
                    elementId: currentControl.elementId,
                    generation: currentControl.generation,
                    actionCapable: currentControl.methods.includes("action"),
                  }),
                ],
        );
        const queueState = (queueId: "queue" | "r_queue") => {
          const entries = readProperty(readProperty(root, queueId), "queue");
          return !Array.isArray(entries)
            ? "unavailable"
            : entries.length > 0
              ? "active"
              : "empty";
        };
        const queues = [queueState("queue"), queueState("r_queue")];
        const claimStillRelevant =
          claims.length > 0 &&
          settingsValue["prestigeType"] === "mad" &&
          settingsValue["autoResearch"] === true &&
          settingsValue["autoTrigger"] !== true &&
          !queues.includes("active") &&
          claims.some(
            (currentClaim) =>
              readTechLevel(root, currentClaim.targetGrantTechnology) <
              currentClaim.targetGrantLevel,
          );
        if (claimStillRelevant && claims.length > 0) {
          resourceClaimLedger = planResourceClaimLedger({
            claims,
            freshness,
            controlBindings:
              currentControlBindings.length === claims.length
                ? currentControlBindings
                : undefined,
            stock: resources.Mana.currentQuantity,
            knownReservations:
              observationAvailable && !queues.includes("unavailable")
                ? reservations
                : undefined,
            forecastProductionPerSecond: claims[0]?.forecastProductionPerSecond,
          });
        } else if (claims.length > 0 && queues.includes("unavailable")) {
          resourceClaimLedger = planResourceClaimLedger({
            claims,
            freshness,
            controlBindings:
              currentControlBindings.length === claims.length
                ? currentControlBindings
                : undefined,
            stock: resources.Mana.currentQuantity,
            knownReservations: undefined,
            forecastProductionPerSecond: claims[0]?.forecastProductionPerSecond,
          });
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
        ...(typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
        __EA_TEST_SURFACE_ENABLED__ === true &&
        testStandardResearchTarget !== undefined
          ? {
              testOnlyStoneTarget: Object.freeze({
                quantity: testStandardResearchTarget.stonePrice,
                clickBudget: testStandardResearchTarget.clickBudget,
              }),
            }
          : {}),
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
        ...(testIntervention === undefined ? {} : { testIntervention }),
        ...(typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
        __EA_TEST_SURFACE_ENABLED__ === true &&
        testStandardResearchTarget !== undefined
          ? { testStandardResearchTarget }
          : {}),
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
      const claimActionObserver =
        typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
        __EA_TEST_SURFACE_ENABLED__ === true
          ? readProperty(active.testIntervention, "resourceClaimActionObserver")
          : undefined;
      let previousIndex = -1;
      let remainingClaimSpend =
        active.resourceClaimLedger?.spendableStock ?? Infinity;
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
          if (
            typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
            __EA_TEST_SURFACE_ENABLED__ === true &&
            active.testStandardResearchTarget !== undefined &&
            operation.actionId === "stone" &&
            (handle.generation !==
              active.testStandardResearchTarget.stoneControlGeneration ||
              !active.testStandardResearchTarget.isCurrent())
          )
            return stale(
              "gather-research-target-stale",
              "current Sundial offer or Gather control changed",
            );
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
            const expectedManaSpend = conjuring && manaBefore >= 1;
            const proposedManaSpend = expectedManaSpend ? 1 : 0;
            if (
              active.resourceClaimLedger !== undefined &&
              expectedManaSpend &&
              remainingClaimSpend < 1
            ) {
              if (typeof claimActionObserver === "function")
                claimActionObserver(
                  Object.freeze({
                    phase: "deferred",
                    actionId: operation.actionId,
                    proposedManaSpend,
                    currentMana: manaBefore,
                    budgetRemaining: remainingClaimSpend,
                    reason: "gather-claim-budget-exhausted",
                  }),
                );
              return stale(
                "gather-claim-budget-exhausted",
                `Mana claim budget was exhausted before ${operation.actionId}`,
              );
            }
            if (typeof claimActionObserver === "function")
              claimActionObserver(
                Object.freeze({
                  phase: "before-action",
                  actionId: operation.actionId,
                  proposedManaSpend,
                  currentMana: manaBefore,
                  budgetRemaining: remainingClaimSpend,
                }),
              );
            const result = controls.invoke(handle, "action");
            if (!result.ok) {
              if (typeof claimActionObserver === "function")
                claimActionObserver(
                  Object.freeze({
                    phase: "rejected",
                    actionId: operation.actionId,
                    proposedManaSpend,
                    currentMana: manaBefore,
                    budgetRemaining: remainingClaimSpend,
                    reason: result.detail ?? result.reason,
                  }),
                );
              return result.reason === "stale-control"
                ? stale("gather-control-stale", result.detail ?? result.reason)
                : rejected(
                    "gather-click-failed",
                    result.detail ?? result.reason,
                  );
            }
            let stopTargetAfterClick = false;
            if (
              typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
              __EA_TEST_SURFACE_ENABLED__ === true &&
              active.testStandardResearchTarget !== undefined &&
              operation.actionId === "stone"
            ) {
              const afterTargetClickRoot = rootState.readRoot();
              if (
                afterTargetClickRoot !== active.root ||
                !active.testStandardResearchTarget.isCurrent()
              )
                return stale(
                  "gather-research-target-invalidated",
                  "current Sundial offer changed during Gather",
                );
              const stoneAfter = currentQuantity(afterTargetClickRoot, "Stone");
              if (stoneAfter >= active.testStandardResearchTarget.stonePrice)
                stopTargetAfterClick = true;
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
              if (claimBudgetOverage > 1e-9) {
                return stale(
                  "gather-claim-budget-exceeded",
                  `Mana claim budget was exceeded by ${operation.actionId}`,
                );
              }
              remainingClaimSpend = Math.max(
                0,
                claimBudgetBeforeClick - actualManaSpend,
              );
              if (typeof claimActionObserver === "function")
                claimActionObserver(
                  Object.freeze({
                    phase: "after-action",
                    actionId: operation.actionId,
                    proposedManaSpend,
                    actualManaSpend,
                    manaBefore,
                    manaAfter,
                    budgetRemaining: remainingClaimSpend,
                  }),
                );
            } else if (typeof claimActionObserver === "function") {
              const afterClickRoot = rootState.readRoot();
              const manaAfter =
                afterClickRoot === active.root
                  ? readResource(afterClickRoot, "Mana").currentQuantity
                  : undefined;
              claimActionObserver(
                Object.freeze({
                  phase: "after-action",
                  actionId: operation.actionId,
                  proposedManaSpend,
                  actualManaSpend:
                    typeof manaAfter === "number"
                      ? manaBefore - manaAfter
                      : undefined,
                  manaBefore,
                  manaAfter,
                  budgetRemaining: undefined,
                }),
              );
            }
            if (stopTargetAfterClick) break;
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
