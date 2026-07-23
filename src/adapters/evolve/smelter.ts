import type {
  SmelterCostView,
  SmelterDecision,
  SmelterFuelView,
  SmelterInput,
  SmelterProductionId,
} from "../../domain/economy/production/smelter.ts";
import type { DecisionExecutor } from "../../ports/decision-executor.ts";
import { rejected, stale, SUCCEEDED } from "../command-outcomes.ts";
import {
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

export interface SmelterReaderDependencies {
  readonly getSmelterManager: () => unknown;
  readonly getGame: () => unknown;
  readonly getResources: () => unknown;
  readonly getSettings: () => unknown;
  readonly getJobs: () => unknown;
  readonly getBuildings: () => unknown;
  readonly haveTech: (tech: string) => boolean;
  readonly consumptionBalanceMin: number;
}

function callBoolean(
  record: UnknownRecord,
  name: string,
  path: string,
  ...args: unknown[]
): boolean {
  const method = requireFunction(record[name], `${path}.${name}`);
  return Boolean(Reflect.apply(method, record, args));
}

function callNumber(
  record: UnknownRecord,
  name: string,
  path: string,
  ...args: unknown[]
): number {
  const method = requireFunction(record[name], `${path}.${name}`);
  return requireNumber(
    Reflect.apply(method, record, args),
    `${path}.${name}()`,
  );
}

function readCost(value: unknown, path: string): SmelterCostView {
  const cost = requireRecord(value, path);
  const resource = requireRecord(cost["resource"], `${path}.resource`);
  const name = resource["name"];
  if (typeof name !== "string") {
    throw new TypeError(`${path}.resource.name must be a string`);
  }
  return Object.freeze({
    resourceName: name,
    currentQuantity: requireNumber(
      resource["currentQuantity"],
      `${path}.resource.currentQuantity`,
    ),
    rateOfChange: requireNumber(
      resource["rateOfChange"],
      `${path}.resource.rateOfChange`,
    ),
    isDemanded: callBoolean(resource, "isDemanded", `${path}.resource`),
    quantity: requireNumber(cost["quantity"], `${path}.quantity`),
    minRateOfChange: requireNumber(
      cost["minRateOfChange"],
      `${path}.minRateOfChange`,
    ),
  });
}

function readCostList(value: unknown, path: string): SmelterCostView[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array`);
  }
  return value.map((entry, index) => readCost(entry, `${path}[${index}]`));
}

function readFuels(manager: UnknownRecord): SmelterFuelView[] {
  const priorityList = Reflect.apply(
    requireFunction(
      manager["managedFuelPriorityList"],
      "SmelterManager.managedFuelPriorityList",
    ),
    manager,
    [],
  );
  if (!Array.isArray(priorityList)) {
    throw new TypeError(
      "SmelterManager.managedFuelPriorityList() must return an array",
    );
  }
  const fuels = requireRecord(manager["Fuels"], "SmelterManager.Fuels");
  const inferno = fuels["Inferno"];
  const oil = fuels["Oil"];

  return priorityList.map((entry, index) => {
    const path = `SmelterManager.Fuels[${index}]`;
    const fuel = requireRecord(entry, path);
    const id = fuel["id"];
    if (typeof id !== "string") {
      throw new TypeError(`${path}.id must be a string`);
    }
    const unlocked = Boolean(fuel["unlocked"]);
    const isInfernoBeforeOil =
      fuel === inferno && priorityList[index + 1] === oil;
    if (!unlocked) {
      // Locked fuels are skipped by the planner; no further reads.
      return Object.freeze({
        id,
        unlocked: false,
        isInfernoBeforeOil,
        currentFuelCount: 0,
        cost: Object.freeze([]),
      });
    }
    return Object.freeze({
      id,
      unlocked: true,
      isInfernoBeforeOil,
      currentFuelCount: callNumber(
        manager,
        "fueledCount",
        "SmelterManager",
        fuel,
      ),
      cost: Object.freeze(readCostList(fuel["cost"], `${path}.cost`)),
    });
  });
}

export function readSmelterInput(
  dependencies: SmelterReaderDependencies,
): SmelterInput {
  const manager = requireRecord(
    dependencies.getSmelterManager(),
    "SmelterManager",
  );
  // No smelter; no auto smelter. Legacy returns immediately.
  if (!callBoolean(manager, "initIndustry", "SmelterManager")) {
    return Object.freeze({
      initialised: false,
      hasForge: false,
      totalSmelters: 0,
      extraOperating: 0,
      consumptionBalanceMin: dependencies.consumptionBalanceMin,
      fuels: Object.freeze([]),
      ironCount: 0,
      steelCount: 0,
      iridiumCount: 0,
      iridiumUnlocked: false,
      iridiumCapped: false,
      productionSmeltingIridium: 0,
      productionSmelting: "",
      steelCost: Object.freeze([]),
      ironTimeToFull: 0,
      ironTimeToRequired: 0,
      ironDemanded: false,
      steelTimeToFull: 0,
      steelTimeToRequired: 0,
      steelDemanded: false,
      minerCount: 0,
      beltIronShipStateOnCount: 0,
      titaniumStorageRatio: 0,
      haveTitaniumTech: false,
    });
  }

  const game = requireRecord(dependencies.getGame(), "game");
  const global = requireRecord(game["global"], "game.global");
  const race = requireRecord(global["race"], "game.global.race");
  const hasForge = Boolean(race["forge"]);

  const totalSmelters = callNumber(manager, "maxOperating", "SmelterManager");
  const fuels = hasForge ? [] : readFuels(manager);
  const extraOperating = callNumber(
    manager,
    "extraOperating",
    "SmelterManager",
  );

  const productions = requireRecord(
    manager["Productions"],
    "SmelterManager.Productions",
  );
  const ironProduction = requireRecord(
    productions["Iron"],
    "SmelterManager.Productions.Iron",
  );
  const steelProduction = requireRecord(
    productions["Steel"],
    "SmelterManager.Productions.Steel",
  );
  const iridiumProduction = requireRecord(
    productions["Iridium"],
    "SmelterManager.Productions.Iridium",
  );

  const ironCount = callNumber(
    manager,
    "smeltingCount",
    "SmelterManager",
    ironProduction,
  );
  const steelCount = callNumber(
    manager,
    "smeltingCount",
    "SmelterManager",
    steelProduction,
  );
  const iridiumCount = callNumber(
    manager,
    "smeltingCount",
    "SmelterManager",
    iridiumProduction,
  );

  const resources = requireRecord(dependencies.getResources(), "resources");
  const iron = requireRecord(resources["Iron"], "resources.Iron");
  const steel = requireRecord(resources["Steel"], "resources.Steel");
  const iridium = requireRecord(resources["Iridium"], "resources.Iridium");
  const titanium = requireRecord(resources["Titanium"], "resources.Titanium");

  const iridiumUnlocked = Boolean(iridiumProduction["unlocked"]);
  const iridiumCapped = iridiumUnlocked
    ? callBoolean(iridium, "isCapped", "resources.Iridium")
    : false;

  const settings = requireRecord(dependencies.getSettings(), "settings");
  const productionSmeltingIridium = requireNumber(
    settings["productionSmeltingIridium"],
    "settings.productionSmeltingIridium",
  );
  const productionSmeltingValue = settings["productionSmelting"];
  const productionSmelting =
    typeof productionSmeltingValue === "string" ? productionSmeltingValue : "";

  const jobs = requireRecord(dependencies.getJobs(), "jobs");
  const miner = requireRecord(jobs["Miner"], "jobs.Miner");
  const buildings = requireRecord(dependencies.getBuildings(), "buildings");
  const beltIronShip = requireRecord(
    buildings["BeltIronShip"],
    "buildings.BeltIronShip",
  );

  return Object.freeze({
    initialised: true,
    hasForge,
    totalSmelters,
    extraOperating,
    consumptionBalanceMin: dependencies.consumptionBalanceMin,
    fuels: Object.freeze(fuels),
    ironCount,
    steelCount,
    iridiumCount,
    iridiumUnlocked,
    iridiumCapped,
    productionSmeltingIridium,
    productionSmelting,
    steelCost: Object.freeze(
      readCostList(
        steelProduction["cost"],
        "SmelterManager.Productions.Steel.cost",
      ),
    ),
    ironTimeToFull: requireNumber(
      iron["timeToFull"],
      "resources.Iron.timeToFull",
    ),
    ironTimeToRequired: requireNumber(
      iron["timeToRequired"],
      "resources.Iron.timeToRequired",
    ),
    ironDemanded: callBoolean(iron, "isDemanded", "resources.Iron"),
    steelTimeToFull: requireNumber(
      steel["timeToFull"],
      "resources.Steel.timeToFull",
    ),
    steelTimeToRequired: requireNumber(
      steel["timeToRequired"],
      "resources.Steel.timeToRequired",
    ),
    steelDemanded: callBoolean(steel, "isDemanded", "resources.Steel"),
    minerCount: requireNumber(miner["count"], "jobs.Miner.count"),
    beltIronShipStateOnCount: requireNumber(
      beltIronShip["stateOnCount"],
      "buildings.BeltIronShip.stateOnCount",
    ),
    titaniumStorageRatio: requireNumber(
      titanium["storageRatio"],
      "resources.Titanium.storageRatio",
    ),
    haveTitaniumTech: dependencies.haveTech("titanium"),
  });
}

export function createSmelterCommandExecutor(
  getSmelterManager: () => unknown,
): DecisionExecutor<SmelterDecision> {
  function execute(decision: Readonly<SmelterDecision>) {
    if (
      decision.fuelAdjustments.length === 0 &&
      decision.smeltAdjustments.length === 0
    ) {
      return SUCCEEDED;
    }

    const manager = requireRecord(getSmelterManager(), "SmelterManager");
    const fuels = requireRecord(manager["Fuels"], "SmelterManager.Fuels");
    const productions = requireRecord(
      manager["Productions"],
      "SmelterManager.Productions",
    );
    const fueledCount = requireFunction(
      manager["fueledCount"],
      "SmelterManager.fueledCount",
    );
    const smeltingCount = requireFunction(
      manager["smeltingCount"],
      "SmelterManager.smeltingCount",
    );
    const decreaseFuel = requireFunction(
      manager["decreaseFuel"],
      "SmelterManager.decreaseFuel",
    );
    const increaseFuel = requireFunction(
      manager["increaseFuel"],
      "SmelterManager.increaseFuel",
    );
    const decreaseSmelting = requireFunction(
      manager["decreaseSmelting"],
      "SmelterManager.decreaseSmelting",
    );
    const increaseSmelting = requireFunction(
      manager["increaseSmelting"],
      "SmelterManager.increaseSmelting",
    );

    // Validate every sampled precondition before mutating anything, so applying
    // fuel commands (which can shift smelting in-game) cannot trigger a false
    // stale on the smelting reads.
    const resolvedFuels: {
      readonly fuel: UnknownRecord;
      readonly delta: number;
    }[] = [];
    for (const adjustment of decision.fuelAdjustments) {
      if (!Number.isSafeInteger(adjustment.delta)) {
        return rejected(
          "invalid-smelter-fuel-adjustment",
          "smelter fuel adjustment must be a safe integer",
        );
      }
      const fuel = requireRecord(
        fuels[adjustment.fuelId],
        `SmelterManager.Fuels.${adjustment.fuelId}`,
      );
      const actual = requireNumber(
        Reflect.apply(fueledCount, manager, [fuel]),
        `SmelterManager.fueledCount(${adjustment.fuelId})`,
      );
      if (actual !== adjustment.expectedCurrentFuelCount) {
        return stale("stale-smelter-fuel", "smelter fuel count changed", {
          fuelId: adjustment.fuelId,
          expected: adjustment.expectedCurrentFuelCount,
          actual,
        });
      }
      resolvedFuels.push({ fuel, delta: adjustment.delta });
    }

    const resolvedSmelt: {
      readonly productionId: SmelterProductionId;
      readonly delta: number;
    }[] = [];
    for (const adjustment of decision.smeltAdjustments) {
      if (!Number.isSafeInteger(adjustment.delta)) {
        return rejected(
          "invalid-smelter-smelt-adjustment",
          "smelter smelting adjustment must be a safe integer",
        );
      }
      const production = requireRecord(
        productions[adjustment.productionId],
        `SmelterManager.Productions.${adjustment.productionId}`,
      );
      const actual = requireNumber(
        Reflect.apply(smeltingCount, manager, [production]),
        `SmelterManager.smeltingCount(${adjustment.productionId})`,
      );
      if (actual !== adjustment.expectedCurrentCount) {
        return stale(
          "stale-smelter-smelting",
          "smelter smelting count changed",
          {
            productionId: adjustment.productionId,
            expected: adjustment.expectedCurrentCount,
            actual,
          },
        );
      }
      resolvedSmelt.push({
        productionId: adjustment.productionId,
        delta: adjustment.delta,
      });
    }

    for (const { fuel, delta } of resolvedFuels) {
      if (delta < 0) {
        Reflect.apply(decreaseFuel, manager, [fuel, delta * -1]);
      }
    }
    for (const { fuel, delta } of resolvedFuels) {
      if (delta > 0) {
        Reflect.apply(increaseFuel, manager, [fuel, delta]);
      }
    }
    for (const { productionId, delta } of resolvedSmelt) {
      if (delta < 0) {
        Reflect.apply(decreaseSmelting, manager, [productionId, delta * -1]);
      }
    }
    for (const { productionId, delta } of resolvedSmelt) {
      if (delta > 0) {
        Reflect.apply(increaseSmelting, manager, [productionId, delta]);
      }
    }
    return SUCCEEDED;
  }

  return Object.freeze({ execute });
}
