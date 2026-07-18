import type {
  GatherActionId,
  GatherOperation,
  GatherResourceAssignment,
  GatherResourceId,
  GatherResourcesDecision,
  GatherResourcesInput,
} from "../../domain/gather-resources.ts";
import type { DecisionExecutor } from "../../ports/decision-executor.ts";
import type { GatherResourcesReader } from "../../ports/gather-resources.ts";
import { rejected, stale, SUCCEEDED } from "../command-outcomes.ts";
import {
  requireBoolean,
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

const ACTION_ORDER: readonly GatherActionId[] = Object.freeze([
  "food",
  "lumber",
  "stone",
  "chrysotile",
  "slaughter",
]);
const RESOURCE_IDS: readonly GatherResourceId[] = Object.freeze([
  "Food",
  "Lumber",
  "Stone",
  "Chrysotile",
  "Furs",
  "Mana",
]);

interface GatherResourcesSession {
  readonly game: UnknownRecord;
  readonly registry: UnknownRecord;
  readonly resources: Readonly<
    Partial<Record<GatherResourceId, UnknownRecord>>
  >;
  readonly initialQuantities: Readonly<Record<GatherResourceId, number>>;
}

export interface GatherResourcesAdapterDependencies {
  readonly getGame: () => unknown;
  readonly getSettings: () => unknown;
  readonly getResources: () => unknown;
  readonly getBuildings: () => unknown;
  readonly getResourcesPerClick: () => unknown;
}

function callBoolean(record: UnknownRecord, name: string, path: string) {
  return Boolean(
    Reflect.apply(requireFunction(record[name], `${path}.${name}`), record, []),
  );
}

function readTechnology(
  technology: UnknownRecord,
  id: string,
  level: number,
): boolean {
  const value = technology[id];
  return value === undefined || value === null
    ? false
    : requireNumber(value, `game.global.tech.${id}`) >= level;
}

function readResource(
  registry: UnknownRecord,
  id: GatherResourceId,
): UnknownRecord {
  return requireRecord(registry[id], `resources.${id}`);
}

function readQuantity(resource: UnknownRecord, id: GatherResourceId): number {
  return requireNumber(
    resource["currentQuantity"],
    `resources.${id}.currentQuantity`,
  );
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

export function createGatherResourcesAdapter(
  dependencies: GatherResourcesAdapterDependencies,
): {
  readonly reader: GatherResourcesReader;
  readonly executor: DecisionExecutor<GatherResourcesDecision>;
} {
  let session: GatherResourcesSession | null = null;

  const reader: GatherResourcesReader = Object.freeze({
    read(): GatherResourcesInput {
      const game = requireRecord(dependencies.getGame(), "game");
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const registry = requireRecord(dependencies.getResources(), "resources");
      const buildings = requireRecord(dependencies.getBuildings(), "buildings");
      const global = requireRecord(game["global"], "game.global");
      const race = requireRecord(global["race"], "game.global.race");
      const technology = requireRecord(global["tech"], "game.global.tech");
      const population = requireRecord(
        registry["Population"],
        "resources.Population",
      );
      const alwaysClick = requireBoolean(
        settings["buildingAlwaysClick"],
        "settings.buildingAlwaysClick",
      );
      const populationCurrent = requireNumber(
        population["currentQuantity"],
        "resources.Population.currentQuantity",
      );
      if (!alwaysClick && populationCurrent > 15) {
        const quarry = requireRecord(
          buildings["RockQuarry"],
          "buildings.RockQuarry",
        );
        const quarryCount = requireNumber(
          quarry["count"],
          "buildings.RockQuarry.count",
        );
        if (quarryCount > 0 || Boolean(race["sappy"])) {
          session = null;
          return emptyInput();
        }
      }

      const resourcesPerClick = requireNumber(
        dependencies.getResourcesPerClick(),
        "resourcesPerClick",
      );
      if (resourcesPerClick <= 0) {
        throw new TypeError("resourcesPerClick must be greater than zero");
      }
      const clickLimit = requireNumber(
        settings["buildingClickPerTick"],
        "settings.buildingClickPerTick",
      );
      if (!Number.isSafeInteger(clickLimit) || clickLimit < 0) {
        throw new TypeError(
          "settings.buildingClickPerTick must be a non-negative safe integer",
        );
      }

      const fasting = Boolean(race["fasting"]);
      const soulEater = Boolean(race["soul_eater"]);
      const clickable = {
        food: callBoolean(
          requireRecord(buildings["Food"], "buildings.Food"),
          "isClickable",
          "buildings.Food",
        ),
        lumber: callBoolean(
          requireRecord(buildings["Lumber"], "buildings.Lumber"),
          "isClickable",
          "buildings.Lumber",
        ),
        stone: callBoolean(
          requireRecord(buildings["Stone"], "buildings.Stone"),
          "isClickable",
          "buildings.Stone",
        ),
        chrysotile: callBoolean(
          requireRecord(buildings["Chrysotile"], "buildings.Chrysotile"),
          "isClickable",
          "buildings.Chrysotile",
        ),
        slaughter: callBoolean(
          requireRecord(buildings["Slaughter"], "buildings.Slaughter"),
          "isClickable",
          "buildings.Slaughter",
        ),
      };
      const foodConjuring =
        clickable.food && !fasting
          ? readTechnology(technology, "conjuring", 1)
          : false;
      const materialConjuring =
        clickable.lumber || clickable.stone || clickable.chrysotile
          ? readTechnology(technology, "conjuring", 2)
          : false;
      const primitive =
        clickable.slaughter && soulEater
          ? readTechnology(technology, "primitive", 1)
          : false;

      const resourceRecords: Partial<Record<GatherResourceId, UnknownRecord>> =
        {};
      const initialQuantities: Record<GatherResourceId, number> = {
        Food: 0,
        Lumber: 0,
        Stone: 0,
        Chrysotile: 0,
        Furs: 0,
        Mana: 0,
      };
      const emptyResource = Object.freeze({
        currentQuantity: 0,
        maxQuantity: 0,
      });
      const resourceInput: Record<
        GatherResourceId,
        { readonly currentQuantity: number; readonly maxQuantity: number }
      > = {
        Food: emptyResource,
        Lumber: emptyResource,
        Stone: emptyResource,
        Chrysotile: emptyResource,
        Furs: emptyResource,
        Mana: emptyResource,
      };
      const readNeededResource = (id: GatherResourceId) => {
        const resource = readResource(registry, id);
        const currentQuantity = readQuantity(resource, id);
        const maxQuantity =
          id === "Mana"
            ? 0
            : requireNumber(
                resource["maxQuantity"],
                `resources.${id}.maxQuantity`,
              );
        resourceRecords[id] = resource;
        initialQuantities[id] = currentQuantity;
        resourceInput[id] = Object.freeze({ currentQuantity, maxQuantity });
      };
      if ((clickable.food && !fasting) || clickable.slaughter) {
        readNeededResource("Food");
      }
      if (clickable.lumber || clickable.slaughter) {
        readNeededResource("Lumber");
      }
      if (clickable.stone) readNeededResource("Stone");
      if (clickable.chrysotile) readNeededResource("Chrysotile");
      if (clickable.slaughter) readNeededResource("Furs");
      if (foodConjuring || materialConjuring) readNeededResource("Mana");
      const fursUnlocked =
        clickable.slaughter && resourceRecords.Furs !== undefined
          ? callBoolean(resourceRecords.Furs, "isUnlocked", "resources.Furs")
          : false;
      session = Object.freeze({
        game,
        registry,
        resources: Object.freeze(resourceRecords),
        initialQuantities: Object.freeze(initialQuantities),
      });
      return Object.freeze({
        stopped: false,
        resourcesPerClick,
        clickLimit,
        fasting,
        soulEater,
        primitive,
        foodConjuring,
        materialConjuring,
        fursUnlocked,
        clickable: Object.freeze(clickable),
        resources: Object.freeze(resourceInput),
      });
    },
  });

  const executor: DecisionExecutor<GatherResourcesDecision> = Object.freeze({
    execute(decision: Readonly<GatherResourcesDecision>) {
      if (!Array.isArray(decision.operations)) {
        return rejected(
          "invalid-gather-operations",
          "gather operations must be an array",
        );
      }
      const operations =
        decision.operations as readonly Readonly<GatherOperation>[];
      const active = session;
      if (active === null) {
        return stale(
          "gather-session-missing",
          "Gather resources read session is missing",
        );
      }
      const game = requireRecord(dependencies.getGame(), "game");
      const registry = requireRecord(dependencies.getResources(), "resources");
      if (game !== active.game || registry !== active.registry) {
        return stale(
          "gather-context-changed",
          "Gather resources context changed",
        );
      }
      for (const id of RESOURCE_IDS) {
        const resource = active.resources[id];
        if (resource === undefined) continue;
        if (registry[id] !== resource) {
          return stale(
            "gather-resource-changed",
            `Gather resource ${id} changed`,
          );
        }
        const actual = readQuantity(resource, id);
        const expected = active.initialQuantities[id];
        if (actual !== expected) {
          return stale(
            "gather-quantity-changed",
            `Gather resource ${id} quantity changed`,
            { resourceId: id, expected, actual },
          );
        }
      }

      const simulated = { ...active.initialQuantities };
      const prepared: {
        readonly operation: Readonly<GatherOperation>;
        readonly action: UnknownRecord | null;
        readonly actionFunction: ((...args: unknown[]) => unknown) | null;
      }[] = [];
      let previousActionIndex = -1;
      for (const operation of operations) {
        const actionIndex = ACTION_ORDER.indexOf(operation.actionId);
        if (
          actionIndex <= previousActionIndex ||
          typeof operation.amount !== "number" ||
          !Number.isFinite(operation.amount) ||
          !Array.isArray(operation.beforeAction) ||
          !Array.isArray(operation.afterAction)
        ) {
          return rejected(
            "invalid-gather-operation",
            "gather operations must be finite and follow resource order",
          );
        }
        previousActionIndex = actionIndex;
        const clickCount =
          operation.amount > 0 ? Math.ceil(operation.amount) : 0;
        if (!Number.isSafeInteger(clickCount)) {
          return rejected(
            "invalid-gather-click-count",
            "gather click count must be a safe integer",
          );
        }
        const assignments = [
          ...operation.beforeAction,
          ...operation.afterAction,
        ] as readonly Readonly<GatherResourceAssignment>[];
        for (const assignment of assignments) {
          if (
            !RESOURCE_IDS.includes(assignment.resourceId) ||
            typeof assignment.expectedQuantity !== "number" ||
            !Number.isFinite(assignment.expectedQuantity) ||
            typeof assignment.quantity !== "number" ||
            !Number.isFinite(assignment.quantity) ||
            simulated[assignment.resourceId] !== assignment.expectedQuantity
          ) {
            return rejected(
              "invalid-gather-assignment",
              "gather assignments must form a finite sequential state",
            );
          }
          if (active.resources[assignment.resourceId] === undefined) {
            return rejected(
              "invalid-gather-assignment",
              "gather assignments require a sampled resource",
            );
          }
          simulated[assignment.resourceId] = assignment.quantity;
        }
        let action: UnknownRecord | null = null;
        let actionFunction: ((...args: unknown[]) => unknown) | null = null;
        if (clickCount > 0) {
          const actions = requireRecord(game["actions"], "game.actions");
          const city = requireRecord(actions["city"], "game.actions.city");
          action = requireRecord(
            city[operation.actionId],
            `game.actions.city.${operation.actionId}`,
          );
          actionFunction = requireFunction(
            action["action"],
            `game.actions.city.${operation.actionId}.action`,
          );
        }
        prepared.push({ operation, action, actionFunction });
      }

      const applyAssignments = (
        assignments: readonly Readonly<GatherResourceAssignment>[],
      ) => {
        for (const assignment of assignments) {
          const resource = active.resources[assignment.resourceId];
          if (resource !== undefined) {
            resource["currentQuantity"] = assignment.quantity;
          }
        }
      };
      for (const entry of prepared) {
        applyAssignments(entry.operation.beforeAction);
        if (entry.action !== null && entry.actionFunction !== null) {
          for (let index = 0; index < entry.operation.amount; index++) {
            Reflect.apply(entry.actionFunction, entry.action, []);
          }
        }
        applyAssignments(entry.operation.afterAction);
      }
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}
