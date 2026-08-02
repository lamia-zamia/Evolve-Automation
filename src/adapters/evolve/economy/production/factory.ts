import type {
  FactoryDecision,
  FactoryInput,
  FactoryMaterialInput,
  FactoryProductionInput,
} from "../../../../domain/economy/production/factory.ts";
import type { DecisionExecutor } from "../../../../ports/decision-executor.ts";
import type { FactoryReader } from "../../../../ports/factory.ts";
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

interface ProductionIdentity {
  readonly id: string;
  readonly outputResourceId: string;
  readonly value: UnknownRecord;
}

interface FactorySession {
  readonly manager: UnknownRecord;
  readonly productions: readonly ProductionIdentity[];
  readonly byId: ReadonlyMap<string, ProductionIdentity>;
}

export interface FactoryAdapterDependencies {
  // TRANSITIONAL: FactoryManager remains the narrow bridge to the current
  // iFactory Vue control until the Milestone 5 game adapter replaces it.
  readonly getManager: () => unknown;
  readonly getState: () => unknown;
  readonly getSettings: () => unknown;
  readonly getGame: () => unknown;
  readonly getResources: () => unknown;
  readonly consumptionBalanceMinimum: number;
}

function optionalWeighting(production: UnknownRecord, path: string): number {
  const value = production["weighting"];
  return value === undefined || value === null
    ? 0
    : requireNumber(value, `${path}.weighting`);
}

function readCatalog(manager: UnknownRecord): {
  readonly values: readonly ProductionIdentity[];
  readonly byId: ReadonlyMap<string, ProductionIdentity>;
  readonly nanoTube: unknown;
} {
  const productions = requireRecord(
    manager["Productions"],
    "FactoryManager.Productions",
  );
  const values: ProductionIdentity[] = [];
  const byId = new Map<string, ProductionIdentity>();
  for (const [key, raw] of Object.entries(productions)) {
    const path = `FactoryManager.Productions.${key}`;
    const value = requireRecord(raw, path);
    const id = requireNonEmptyString(value["id"], `${path}.id`);
    const resource = requireRecord(value["resource"], `${path}.resource`);
    const outputResourceId = requireNonEmptyString(
      resource["id"],
      `${path}.resource.id`,
    );
    if (byId.has(id)) {
      throw new TypeError(`FactoryManager.Productions has duplicate id ${id}`);
    }
    const identity = Object.freeze({ id, outputResourceId, value });
    values.push(identity);
    byId.set(id, identity);
  }
  return Object.freeze({
    values: Object.freeze(values),
    byId,
    nanoTube: productions["NanoTube"],
  });
}

function readBuildingWeight(
  buildings: readonly unknown[],
  resourceId: string,
  currentQuantity: number,
): number {
  for (let index = 0; index < buildings.length; index++) {
    const path = `state.unlockedBuildings[${index}]`;
    const building = requireRecord(buildings[index], path);
    const cost = requireRecord(building["cost"], `${path}.cost`);
    const required = cost[resourceId];
    if (required === undefined) continue;
    const quantity = requireNumber(required, `${path}.cost.${resourceId}`);
    if (quantity > currentQuantity) {
      return requireNumber(building["weighting"], `${path}.weighting`);
    }
  }
  return 100;
}

function readMaterial(raw: unknown, path: string): FactoryMaterialInput {
  const cost = requireRecord(raw, path);
  const resource = requireRecord(cost["resource"], `${path}.resource`);
  const resourceId = requireNonEmptyString(
    resource["id"],
    `${path}.resource.id`,
  );
  const unlocked = callBoolean(resource, "isUnlocked", `${path}.resource`);
  if (!unlocked) {
    return Object.freeze({
      resourceId,
      name: "",
      unlocked: false,
      demanded: false,
      currentQuantity: 0,
      rateOfChange: 0,
      storageRatio: 0,
      quantity: 0,
      minRateOfChange: 0,
    });
  }
  const name = resource["name"];
  if (typeof name !== "string") {
    throw new TypeError(`${path}.resource.name must be a string`);
  }
  return Object.freeze({
    resourceId,
    name,
    unlocked: true,
    demanded: callBoolean(resource, "isDemanded", `${path}.resource`),
    currentQuantity: requireNumber(
      resource["currentQuantity"],
      `${path}.resource.currentQuantity`,
    ),
    rateOfChange: requireNumber(
      resource["rateOfChange"],
      `${path}.resource.rateOfChange`,
    ),
    storageRatio: requireNumber(
      resource["storageRatio"],
      `${path}.resource.storageRatio`,
    ),
    quantity: requireNumber(cost["quantity"], `${path}.quantity`),
    minRateOfChange: requireNumber(
      cost["minRateOfChange"],
      `${path}.minRateOfChange`,
    ),
  });
}

function readCosts(
  value: unknown,
  path: string,
): readonly FactoryMaterialInput[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array`);
  }
  return Object.freeze(
    value.map((cost, index) => readMaterial(cost, `${path}[${index}]`)),
  );
}

function emptyInput(balance: number): FactoryInput {
  return Object.freeze({
    initialized: false,
    maximum: 0,
    weightingMode: "",
    hasUnlockedBuildings: false,
    useDemandedMaterials: false,
    minimumIngredientRatio: 0,
    consumptionBalanceMinimum: balance,
    bioseedConstruct: false,
    truepath: false,
    neutroniumCurrent: 0,
    neutroniumName: "",
    productions: Object.freeze([]),
  });
}

export function createFactoryAdapter(
  dependencies: FactoryAdapterDependencies,
): {
  readonly reader: FactoryReader;
  readonly executor: DecisionExecutor<FactoryDecision>;
} {
  const balance = requireNumber(
    dependencies.consumptionBalanceMinimum,
    "consumptionBalanceMinimum",
  );
  let session: FactorySession | null = null;

  const reader: FactoryReader = Object.freeze({
    read(): FactoryInput {
      const manager = requireRecord(
        dependencies.getManager(),
        "FactoryManager",
      );
      if (!callBoolean(manager, "initIndustry", "FactoryManager")) {
        session = null;
        return emptyInput(balance);
      }
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const weightingValue = settings["productionFactoryWeighting"];
      const weightingMode =
        typeof weightingValue === "string" ? weightingValue : "";
      const state = requireRecord(dependencies.getState(), "state");
      let unlockedBuildings: readonly unknown[] = Object.freeze([]);
      if (weightingMode === "buildings") {
        const value = state["unlockedBuildings"];
        if (!Array.isArray(value)) {
          throw new TypeError("state.unlockedBuildings must be an array");
        }
        unlockedBuildings = value;
      }
      const catalog = readCatalog(manager);
      const partial = catalog.values.map((identity, index) => {
        const path = `FactoryManager.Productions[${index}]`;
        const production = identity.value;
        const output = requireRecord(
          production["resource"],
          `${path}.resource`,
        );
        const currentQuantity = requireNumber(
          output["currentQuantity"],
          `${path}.resource.currentQuantity`,
        );
        const storageRequired = requireNumber(
          output["storageRequired"],
          `${path}.resource.storageRequired`,
        );
        const unlocked = Boolean(production["unlocked"]);
        const enabled = Boolean(production["enabled"]);
        const weighting = optionalWeighting(production, path);
        const grouped = unlocked && enabled && weighting > 0;
        return {
          identity,
          path,
          production,
          output,
          currentQuantity,
          storageRequired,
          unlocked,
          enabled,
          weighting,
          priority: grouped
            ? requireNumber(production["priority"], `${path}.priority`)
            : 0,
          demanded: grouped
            ? callBoolean(output, "isDemanded", `${path}.resource`)
            : false,
          buildingWeight:
            weightingMode === "buildings" && unlockedBuildings.length > 0
              ? readBuildingWeight(
                  unlockedBuildings,
                  identity.outputResourceId,
                  currentQuantity,
                )
              : 100,
        };
      });
      const maximum = requireCount(
        callNumber(manager, "maxOperating", "FactoryManager"),
        "FactoryManager.maxOperating()",
      );
      const active = partial.filter((entry) => {
        const priority = entry.demanded
          ? Math.max(entry.priority, 100)
          : entry.priority;
        return (
          maximum > 0 &&
          entry.unlocked &&
          entry.enabled &&
          entry.weighting > 0 &&
          priority !== 0
        );
      });
      const minimumIngredientRatio =
        active.length > 0
          ? requireNumber(
              settings["productionFactoryMinIngredients"],
              "settings.productionFactoryMinIngredients",
            )
          : 0;
      const bioseedConstruct =
        settings["prestigeType"] === "bioseed" &&
        Boolean(settings["prestigeBioseedConstruct"]);
      const needsNeutronium =
        bioseedConstruct &&
        active.some((entry) => entry.production === catalog.nanoTube);
      let truepath = false;
      let neutroniumCurrent = 0;
      let neutroniumName = "";
      if (needsNeutronium) {
        const game = requireRecord(dependencies.getGame(), "game");
        const global = requireRecord(game["global"], "game.global");
        const race = requireRecord(global["race"], "game.global.race");
        truepath = Boolean(race["truepath"]);
        const resources = requireRecord(
          dependencies.getResources(),
          "resources",
        );
        const neutronium = requireRecord(
          resources["Neutronium"],
          "resources.Neutronium",
        );
        neutroniumCurrent = requireNumber(
          neutronium["currentQuantity"],
          "resources.Neutronium.currentQuantity",
        );
        const name = neutronium["name"];
        if (typeof name !== "string") {
          throw new TypeError("resources.Neutronium.name must be a string");
        }
        neutroniumName = name;
      }
      const activeIds = new Set(active.map((entry) => entry.identity.id));
      const productions: FactoryProductionInput[] = partial.map((entry) =>
        Object.freeze({
          id: entry.identity.id,
          outputResourceId: entry.identity.outputResourceId,
          unlocked: entry.unlocked,
          enabled: entry.enabled,
          weighting: entry.weighting,
          priority: entry.priority,
          demanded: entry.demanded,
          useful: activeIds.has(entry.identity.id)
            ? callBoolean(entry.output, "isUseful", `${entry.path}.resource`)
            : false,
          currentQuantity: entry.currentQuantity,
          storageRequired: entry.storageRequired,
          buildingWeight: entry.buildingWeight,
          currentProduction:
            entry.unlocked && entry.enabled
              ? requireCount(
                  callNumber(
                    manager,
                    "currentProduction",
                    "FactoryManager",
                    entry.production,
                  ),
                  `FactoryManager.currentProduction(${entry.identity.id})`,
                )
              : 0,
          isNanoTube: entry.production === catalog.nanoTube,
          costs: activeIds.has(entry.identity.id)
            ? readCosts(entry.production["cost"], `${entry.path}.cost`)
            : Object.freeze([]),
        }),
      );
      session = Object.freeze({
        manager,
        productions: catalog.values,
        byId: catalog.byId,
      });
      return Object.freeze({
        initialized: true,
        maximum,
        weightingMode,
        hasUnlockedBuildings: unlockedBuildings.length > 0,
        useDemandedMaterials: Boolean(settings["useDemanded"]),
        minimumIngredientRatio,
        consumptionBalanceMinimum: balance,
        bioseedConstruct,
        truepath,
        neutroniumCurrent,
        neutroniumName,
        productions: Object.freeze(productions),
      });
    },
  });

  const executor: DecisionExecutor<FactoryDecision> = Object.freeze({
    execute(decision: Readonly<FactoryDecision>) {
      if (
        !Number.isSafeInteger(decision.expectedMaximum) ||
        decision.expectedMaximum < 0
      ) {
        return rejected(
          "invalid-factory-maximum",
          "factory maximum must be a non-negative safe integer",
        );
      }
      const ids = new Set<string>();
      for (const adjustment of decision.adjustments) {
        if (
          typeof adjustment.productionId !== "string" ||
          adjustment.productionId.length === 0 ||
          ids.has(adjustment.productionId) ||
          typeof adjustment.outputResourceId !== "string" ||
          adjustment.outputResourceId.length === 0 ||
          !Number.isSafeInteger(adjustment.expectedCurrent) ||
          adjustment.expectedCurrent < 0 ||
          !Number.isSafeInteger(adjustment.delta) ||
          !Number.isSafeInteger(
            adjustment.expectedCurrent + adjustment.delta,
          ) ||
          adjustment.expectedCurrent + adjustment.delta < 0
        ) {
          return rejected(
            "invalid-factory-adjustment",
            "factory adjustments require unique ids and safe non-negative allocations",
          );
        }
        ids.add(adjustment.productionId);
      }
      const active = session;
      if (active === null) {
        return stale(
          "factory-session-missing",
          "Factory read session is missing",
        );
      }
      const manager = requireRecord(
        dependencies.getManager(),
        "FactoryManager",
      );
      if (manager !== active.manager) {
        return stale("factory-manager-changed", "Factory manager changed");
      }
      if (
        requireCount(
          callNumber(manager, "maxOperating", "FactoryManager"),
          "FactoryManager.maxOperating()",
        ) !== decision.expectedMaximum
      ) {
        return stale("factory-capacity-changed", "Factory capacity changed");
      }
      const catalog = readCatalog(manager);
      if (
        catalog.values.length !== active.productions.length ||
        catalog.values.some(
          (identity, index) =>
            identity.value !== active.productions[index]?.value ||
            identity.id !== active.productions[index]?.id ||
            identity.outputResourceId !==
              active.productions[index]?.outputResourceId,
        )
      ) {
        return stale(
          "factory-productions-changed",
          "Factory productions changed",
        );
      }
      const currentProduction = requireFunction(
        manager["currentProduction"],
        "FactoryManager.currentProduction",
      );
      const decreaseProduction = decision.adjustments.some(
        (adjustment) => adjustment.delta < 0,
      )
        ? requireFunction(
            manager["decreaseProduction"],
            "FactoryManager.decreaseProduction",
          )
        : null;
      const increaseProduction = decision.adjustments.some(
        (adjustment) => adjustment.delta > 0,
      )
        ? requireFunction(
            manager["increaseProduction"],
            "FactoryManager.increaseProduction",
          )
        : null;
      const resolved: {
        readonly adjustment: (typeof decision.adjustments)[number];
        readonly production: UnknownRecord;
      }[] = [];
      for (const adjustment of decision.adjustments) {
        const identity = active.byId.get(adjustment.productionId);
        if (
          identity === undefined ||
          identity.outputResourceId !== adjustment.outputResourceId
        ) {
          return stale(
            "factory-productions-changed",
            "Factory production identity changed",
          );
        }
        const actual = requireCount(
          Reflect.apply(currentProduction, manager, [identity.value]),
          `FactoryManager.currentProduction(${adjustment.productionId})`,
        );
        if (actual !== adjustment.expectedCurrent) {
          return stale(
            "factory-allocation-changed",
            "Factory allocation changed",
            {
              productionId: adjustment.productionId,
              expected: adjustment.expectedCurrent,
              actual,
            },
          );
        }
        resolved.push({ adjustment, production: identity.value });
      }
      for (const entry of resolved) {
        if (entry.adjustment.delta < 0 && decreaseProduction !== null) {
          Reflect.apply(decreaseProduction, manager, [
            entry.production,
            entry.adjustment.delta * -1,
          ]);
        }
      }
      for (const entry of resolved) {
        if (entry.adjustment.delta > 0 && increaseProduction !== null) {
          Reflect.apply(increaseProduction, manager, [
            entry.production,
            entry.adjustment.delta,
          ]);
        }
      }
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}
