import type {
  ExtractorProductionInput,
  ExtractorRatioInput,
  MineRatioInput,
  QuarryRatioInput,
} from "../../domain/resource-ratios.ts";
import {
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

export interface ResourceRatiosReaderDependencies {
  readonly getQuarryManager: () => unknown;
  readonly getMineManager: () => unknown;
  readonly getExtractorManager: () => unknown;
  readonly getResources: () => unknown;
  readonly getSettings: () => unknown;
  readonly getBuildings: () => unknown;
  readonly haveTech: (tech: string, level?: number) => boolean;
}

function initIndustry(manager: UnknownRecord, name: string): boolean {
  const init = requireFunction(manager["initIndustry"], `${name}.initIndustry`);
  return Boolean(Reflect.apply(init, manager, []));
}

function currentProduction(
  manager: UnknownRecord,
  name: string,
  ...args: unknown[]
): number {
  const method = requireFunction(
    manager["currentProduction"],
    `${name}.currentProduction`,
  );
  return requireNumber(
    Reflect.apply(method, manager, args),
    `${name}.currentProduction()`,
  );
}

function resourceDemanded(resources: UnknownRecord, id: string): boolean {
  const resource = requireRecord(resources[id], `resources.${id}`);
  const isDemanded = requireFunction(
    resource["isDemanded"],
    `resources.${id}.isDemanded`,
  );
  return Boolean(Reflect.apply(isDemanded, resource, []));
}

function resourceStorageRatio(resources: UnknownRecord, id: string): number {
  const resource = requireRecord(resources[id], `resources.${id}`);
  return requireNumber(
    resource["storageRatio"],
    `resources.${id}.storageRatio`,
  );
}

function settingNumber(settings: UnknownRecord, key: string): number {
  return requireNumber(settings[key], `settings.${key}`);
}

export function readQuarryRatioInput(
  dependencies: ResourceRatiosReaderDependencies,
): QuarryRatioInput {
  const manager = requireRecord(
    dependencies.getQuarryManager(),
    "QuarryManager",
  );
  if (!initIndustry(manager, "QuarryManager")) {
    return Object.freeze({
      initialised: false,
      currentRatio: 0,
      chrysotileDemanded: false,
      chrysotileStorageRatio: 0,
      stoneDemanded: false,
      stoneStorageRatio: 0,
      hasMetalRefinery: false,
      aluminiumDemanded: false,
      aluminiumStorageRatio: 0,
      chrysotileWeight: 0,
    });
  }
  const resources = requireRecord(dependencies.getResources(), "resources");
  const settings = requireRecord(dependencies.getSettings(), "settings");
  const buildings = requireRecord(dependencies.getBuildings(), "buildings");
  const metalRefinery = requireRecord(
    buildings["MetalRefinery"],
    "buildings.MetalRefinery",
  );
  return Object.freeze({
    initialised: true,
    currentRatio: currentProduction(manager, "QuarryManager"),
    chrysotileDemanded: resourceDemanded(resources, "Chrysotile"),
    chrysotileStorageRatio: resourceStorageRatio(resources, "Chrysotile"),
    stoneDemanded: resourceDemanded(resources, "Stone"),
    stoneStorageRatio: resourceStorageRatio(resources, "Stone"),
    hasMetalRefinery:
      requireNumber(metalRefinery["count"], "buildings.MetalRefinery.count") >
      0,
    aluminiumDemanded: resourceDemanded(resources, "Aluminium"),
    aluminiumStorageRatio: resourceStorageRatio(resources, "Aluminium"),
    chrysotileWeight: settingNumber(settings, "productionChrysotileWeight"),
  });
}

export function readMineRatioInput(
  dependencies: ResourceRatiosReaderDependencies,
): MineRatioInput {
  const manager = requireRecord(dependencies.getMineManager(), "MineManager");
  if (!initIndustry(manager, "MineManager")) {
    return Object.freeze({
      initialised: false,
      currentRatio: 0,
      adamantiteDemanded: false,
      adamantiteStorageRatio: 0,
      aluminiumDemanded: false,
      aluminiumStorageRatio: 0,
      adamantiteWeight: 0,
    });
  }
  const resources = requireRecord(dependencies.getResources(), "resources");
  const settings = requireRecord(dependencies.getSettings(), "settings");
  return Object.freeze({
    initialised: true,
    currentRatio: currentProduction(manager, "MineManager"),
    adamantiteDemanded: resourceDemanded(resources, "Adamantite"),
    adamantiteStorageRatio: resourceStorageRatio(resources, "Adamantite"),
    aluminiumDemanded: resourceDemanded(resources, "Aluminium"),
    aluminiumStorageRatio: resourceStorageRatio(resources, "Aluminium"),
    adamantiteWeight: settingNumber(settings, "productionAdamantiteWeight"),
  });
}

export function readExtractorRatioInput(
  dependencies: ResourceRatiosReaderDependencies,
): ExtractorRatioInput {
  const manager = requireRecord(
    dependencies.getExtractorManager(),
    "ExtractorManager",
  );
  if (!initIndustry(manager, "ExtractorManager")) {
    return Object.freeze({
      initialised: false,
      productions: Object.freeze([]),
    });
  }
  const resources = requireRecord(dependencies.getResources(), "resources");
  const settings = requireRecord(dependencies.getSettings(), "settings");

  const specs = [
    { id: "common", res1: "Iron", res2: "Aluminium" },
    { id: "uncommon", res1: "Iridium", res2: "Neutronium" },
  ];
  if (dependencies.haveTech("tau_roid", 5)) {
    specs.push({ id: "rare", res1: "Orichalcum", res2: "Elerium" });
  }

  const productions: ExtractorProductionInput[] = specs.map((spec) =>
    Object.freeze({
      id: spec.id,
      res1Demanded: resourceDemanded(resources, spec.res1),
      res1StorageRatio: resourceStorageRatio(resources, spec.res1),
      res2Demanded: resourceDemanded(resources, spec.res2),
      res2StorageRatio: resourceStorageRatio(resources, spec.res2),
      weight: settingNumber(settings, `productionExtWeight_${spec.id}`),
      currentRatio: currentProduction(manager, "ExtractorManager", spec.id),
    }),
  );

  return Object.freeze({
    initialised: true,
    productions: Object.freeze(productions),
  });
}
