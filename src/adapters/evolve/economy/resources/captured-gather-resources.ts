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
import type { DecisionExecutor } from "../../../../ports/decision-executor.ts";
import type { GatherResourcesReader } from "../../../../ports/gather-resources.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { isRecord, readProperty } from "../../../validation.ts";

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
}

export interface CapturedGatherResourcesDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  /** Script settings have already crossed storage as unknown and are validated here. */
  readonly readSettings: () => unknown;
  readonly onSkipped?: (key: string, reason: string) => void;
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
  return numberValue(readProperty(readProperty(root, "tech"), id));
}

function readStrongMultiplier(root: unknown): number {
  const rank = readProperty(readProperty(root, "race"), "strong");
  const normalized = rank === true ? 1 : numberValue(rank);
  switch (normalized) {
    case 0.1:
      return 2;
    case 0.25:
      return 2;
    case 0.5:
      return 3;
    case 1:
      return 4;
    case 2:
      return 5;
    case 3:
      return 6;
    case 4:
      return 7;
    default:
      return 1;
  }
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
      const furs = readProperty(readProperty(root, "resource"), "Furs");
      const input = Object.freeze({
        stopped,
        resourcesPerClick:
          readStrongMultiplier(root) *
          (readProperty(readProperty(root, "genes"), "enhance") ? 2 : 1),
        clickLimit,
        fasting: Boolean(readProperty(race, "fasting")),
        soulEater: Boolean(readProperty(race, "soul_eater")),
        primitive: readTechLevel(root, "primitive") >= 1,
        foodConjuring: readTechLevel(root, "conjuring") >= 1,
        materialConjuring: readTechLevel(root, "conjuring") >= 2,
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
      session = Object.freeze({ root });
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
      let previousIndex = -1;
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
            const result = controls.invoke(handle, "action");
            if (!result.ok) {
              return result.reason === "stale-control"
                ? stale("gather-control-stale", result.detail ?? result.reason)
                : rejected(
                    "gather-click-failed",
                    result.detail ?? result.reason,
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
