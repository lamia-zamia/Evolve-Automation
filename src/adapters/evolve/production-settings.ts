import {
  createProductionSettingsReadModel,
  type ProductionSettingsReadModel,
  type ProductionSettingsRow,
} from "../../domain/production-settings.ts";
import {
  requireFunction,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

interface ProductionSettingsEvolveDependencies {
  readonly getResources: () => unknown;
  readonly getCraftablesList: () => unknown;
  readonly getSmelterManager: () => unknown;
  readonly getFactoryManager: () => unknown;
  readonly getDroidManager: () => unknown;
  readonly getReplicatorManager: () => unknown;
  readonly getSettingsRaw: () => unknown;
  readonly consumptionBalanceTarget: number;
}

export interface ProductionSettingsEvolveAdapter {
  readProductionSettingsReadModel(): ProductionSettingsReadModel;
  reorderSmelterFuels(fuelIds: readonly string[]): void;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string")
    throw new TypeError(`${path} must be a string`);
  return value;
}

function readResource(value: unknown, path: string): ProductionSettingsRow {
  const resource = requireRecord(value, path);
  return {
    id: requireString(resource["id"], `${path}.id`),
    label: requireString(resource["name"], `${path}.name`),
  };
}

function readProductionRows(
  value: unknown,
  path: string,
): readonly ProductionSettingsRow[] {
  const manager = requireRecord(value, path);
  const productions = requireRecord(
    manager["Productions"],
    `${path}.Productions`,
  );
  return Object.entries(productions).map(([key, rawProduction]) => {
    const production = requireRecord(
      rawProduction,
      `${path}.Productions.${key}`,
    );
    return readResource(
      production["resource"],
      `${path}.Productions.${key}.resource`,
    );
  });
}

function readFuelRows(value: unknown): readonly ProductionSettingsRow[] {
  const manager = requireRecord(value, "SmelterManager");
  const method = requireFunction(
    manager["managedFuelPriorityList"],
    "SmelterManager.managedFuelPriorityList",
  );
  const fuels = Reflect.apply(method, manager, []);
  if (!Array.isArray(fuels)) {
    throw new TypeError(
      "SmelterManager.managedFuelPriorityList() must return an array",
    );
  }
  return fuels.map((fuel, index) => {
    const record = requireRecord(
      fuel,
      `SmelterManager.managedFuelPriorityList()[${index}]`,
    );
    const id = requireString(
      record["id"],
      `SmelterManager.managedFuelPriorityList()[${index}].id`,
    );
    return { id, label: id };
  });
}

function readFoundryRows(resourcesValue: unknown, craftablesValue: unknown) {
  const resources = requireRecord(resourcesValue, "resources");
  const managedIds = new Set<string>();
  for (const key of ["Scarletite", "Quantium"]) {
    const resource = resources[key];
    if (resource !== undefined) {
      managedIds.add(readResource(resource, `resources.${key}`).id);
    }
  }
  if (!Array.isArray(craftablesValue)) {
    throw new TypeError("craftablesList must be an array");
  }
  return craftablesValue.map((resource, index) => {
    const row = readResource(resource, `craftablesList[${index}]`);
    return { ...row, managed: managedIds.has(row.id) };
  });
}

export function createProductionSettingsEvolveAdapter({
  getResources,
  getCraftablesList,
  getSmelterManager,
  getFactoryManager,
  getDroidManager,
  getReplicatorManager,
  getSettingsRaw,
  consumptionBalanceTarget,
}: ProductionSettingsEvolveDependencies): ProductionSettingsEvolveAdapter {
  function readProductionSettingsReadModel(): ProductionSettingsReadModel {
    return createProductionSettingsReadModel({
      consumptionBalanceTarget,
      smelterFuels: readFuelRows(getSmelterManager()),
      foundryRows: readFoundryRows(getResources(), getCraftablesList()),
      factoryRows: readProductionRows(getFactoryManager(), "FactoryManager"),
      miningDroidRows: readProductionRows(getDroidManager(), "DroidManager"),
      replicatorRows: readProductionRows(
        getReplicatorManager(),
        "ReplicatorManager",
      ),
    });
  }

  function reorderSmelterFuels(fuelIds: readonly string[]): void {
    const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");
    fuelIds.forEach((fuelId, index) => {
      const id = requireString(fuelId, `fuelIds[${index}]`);
      settingsRaw[`smelter_fuel_p_${id}`] = index;
    });
  }

  return Object.freeze({
    readProductionSettingsReadModel,
    reorderSmelterFuels,
  });
}
