/**
 * Settings defaults for the captured runtime.
 *
 * This adapter deliberately exposes only facts that can be read from the captured root/control
 * ports. It does not reach through the Vue 2 managers used by the compatibility runtime. A
 * section whose live catalog is not captured yet still receives its record defaults, while
 * dynamic keys are added only when the upstream page has exposed the corresponding items.
 */

import type {
  BuildingResetContext,
  EjectorResetContext,
  EvolutionResetContext,
  GovernmentResetContext,
  JobResetContext,
  LoggingResetContext,
  MagicResetContext,
  MarketResetContext,
  MinorTraitResetContext,
  MutableTraitResetContext,
  PlanetResetContext,
  ProductionResetContext,
  ProjectResetContext,
  StorageResetContext,
} from "../../domain/settings-defaults.ts";
import type {
  SettingsResetEffects,
  SettingsResetReader,
} from "../../ports/settings-reset.ts";
import type { CapturedSettingsDefaults } from "../../ports/captured-settings-defaults.ts";
import type { GameControlRegistry } from "../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import {
  biomeList,
  challenges,
  extraList,
  planetBiomes,
  planetTraits,
  settingsSections,
  traitList,
} from "./runtime-catalogs.ts";
import { readCapturedJobResetContext } from "./civic/captured-job-catalog.ts";
import { isRecord, readProperty } from "../validation.ts";

export interface CapturedSettingsDefaultsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
}

function readRootSafely(rootState: GameRootStateSource): unknown {
  try {
    return rootState.readRoot();
  } catch {
    // Capture can be incomplete while the game's root is being replaced. Settings shape/default
    // work is independent of that live sample and may proceed with empty catalogs.
    return {};
  }
}

function recordEntries(
  root: unknown,
  key: string,
): readonly [string, Record<string, unknown>][] {
  const value = readProperty(root, key);
  if (!isRecord(value)) return [];
  return Object.entries(value).filter(
    (entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]),
  );
}

function titleCaseKey(id: string): string {
  return id
    .split(/[_-]/u)
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
}

function readResources(
  root: unknown,
): readonly [string, Record<string, unknown>][] {
  return recordEntries(root, "resource");
}

function readResourceIds(root: unknown, property: string): readonly string[] {
  return readResources(root)
    .filter(([, resource]) => readProperty(resource, property) === true)
    .map(([id]) => id);
}

function readKnownResourceId(root: unknown, id: string): string {
  return readResources(root).some(([resourceId]) => resourceId === id)
    ? id
    : "";
}

function readGovernment(): GovernmentResetContext {
  // DeadSpace's GovernmentManager.Types has these stable ids; no manager read is needed for the
  // captured path, and the values are verified against civics.js at the port reference commit.
  return {
    democracyId: "democracy",
    technocracyId: "technocracy",
    corpocracyId: "corpocracy",
  };
}

function readEvolution(): EvolutionResetContext {
  return { challengeIds: challenges.map((set) => set[0]!.id) };
}

function readProjects(root: unknown): ProjectResetContext {
  const projects = recordEntries(root, "arpa");
  const projectIds = projects
    .map(([id]) => id)
    .filter((id) => id !== "sequence");
  const idByKey: Record<string, string> = {};
  projectIds.forEach((id) => {
    idByKey[titleCaseKey(id)] = id;
  });
  return { projectIds, idByKey };
}

function readBuildingContext(
  controls: GameControlRegistry,
): BuildingResetContext {
  const buildings = controls
    .capturedElementIds()
    .filter((id) => id.includes("-") && !id.startsWith("civ-"))
    .map((binding, index) => ({
      binding,
      switchable: false,
      smart: false,
      index,
    }))
    .sort((left, right) => left.index - right.index)
    .map(({ binding, switchable, smart }) => ({
      binding,
      switchable,
      smart,
    }));
  const bindingByKey: Record<string, string> = {};
  buildings.forEach(({ binding }) => {
    const id = binding.slice(binding.indexOf("-") + 1);
    bindingByKey[titleCaseKey(id)] = binding;
  });
  return { buildings, bindingByKey };
}

function readProduction(root: unknown): ProductionResetContext {
  const ids = readResources(root).map(([id]) => id);
  const identityMap = Object.fromEntries(ids.map((id) => [id, id]));
  return {
    foundryResourceIdByKey: identityMap,
    smelterFuelIds: [],
    factoryResourceIdByKey: identityMap,
    droidResourceIdByKey: identityMap,
    replicatorProductionIds: [],
  };
}

function readEjector(root: unknown): EjectorResetContext {
  const resources = readResources(root).map(([id, resource]) => ({
    id,
    isTradable: readProperty(resource, "tradable") === true,
    atomicMass:
      typeof readProperty(resource, "atomicMass") === "number"
        ? (readProperty(resource, "atomicMass") as number)
        : 0,
    ejectConsumable: readProperty(resource, "ejectConsumable") === true,
    supplyConsumable: readProperty(resource, "supplyConsumable") === true,
    naniteConsumable: readProperty(resource, "naniteConsumable") === true,
    supplyIn:
      typeof readProperty(resource, "supplyIn") === "number"
        ? (readProperty(resource, "supplyIn") as number)
        : 0,
  }));
  return {
    universe: String(
      readProperty(readProperty(root, "race"), "universe") ?? "",
    ),
    resources,
    eleriumId: readKnownResourceId(root, "Elerium"),
    inferniteId: readKnownResourceId(root, "Infernite"),
  };
}

export function createCapturedSettingsDefaults({
  rootState,
  controls,
}: CapturedSettingsDefaultsDependencies): CapturedSettingsDefaults {
  const reader: SettingsResetReader = {
    readGovernment,
    readEvolution,
    readLogging: (): LoggingResetContext => ({ gameLogTypeIds: [] }),
    readPlanet: (): PlanetResetContext => ({
      biomeList,
      planetBiomes,
      traitList,
      planetTraits,
      extraList,
    }),
    readMarket: (): MarketResetContext => ({
      tradableResourceIds: readResourceIds(
        readRootSafely(rootState),
        "tradable",
      ),
      galaxyOfferResourceIds: [],
    }),
    readStorage: (): StorageResetContext => ({
      storableResourceIds: readResourceIds(
        readRootSafely(rootState),
        "stackable",
      ),
      orichalcumId: readKnownResourceId(
        readRootSafely(rootState),
        "Orichalcum",
      ),
      vitreloyId: readKnownResourceId(readRootSafely(rootState), "Vitreloy"),
      bolognumId: readKnownResourceId(readRootSafely(rootState), "Bolognium"),
    }),
    readMinorTrait: (): MinorTraitResetContext => ({
      traitNames: [],
      ocularPowerIds: [],
    }),
    readMutableTrait: (): MutableTraitResetContext => ({
      traits: [],
      genusOrder: [],
    }),
    readJob: (): JobResetContext => readCapturedJobResetContext(controls),
    readBuilding: () => readBuildingContext(controls),
    readProject: () => readProjects(readRootSafely(rootState)),
    readMagic: (): MagicResetContext => ({
      alchemyResourceIds: [],
      ritualProductionIds: [],
    }),
    readProduction: () => readProduction(readRootSafely(rootState)),
    readEjector: () => readEjector(readRootSafely(rootState)),
  };
  const startupReader: SettingsResetReader = {
    ...reader,
    readMarket: () => ({
      tradableResourceIds: [],
      galaxyOfferResourceIds: [],
    }),
    readStorage: () => ({
      storableResourceIds: [],
      orichalcumId: "",
      vitreloyId: "",
      bolognumId: "",
    }),
    readJob: () => ({ jobs: [] }),
    readBuilding: () => ({ buildings: [], bindingByKey: {} }),
    readProject: () => ({ projectIds: [], idByKey: {} }),
    readMagic: () => ({ alchemyResourceIds: [], ritualProductionIds: [] }),
    readProduction: () => ({
      foundryResourceIdByKey: {},
      smelterFuelIds: [],
      factoryResourceIdByKey: {},
      droidResourceIdByKey: {},
      replicatorProductionIds: [],
    }),
    readEjector: () => ({
      universe: "",
      resources: [],
      eleriumId: "",
      inferniteId: "",
    }),
  };

  const effects: SettingsResetEffects = {
    setPriorityList: () => {},
    sortByPriority: () => {},
    initBuildingState: () => {},
    rebuildDefaultTriggers: () => [],
  };

  return {
    startupReader,
    reader,
    effects,
    settingsSections,
    techIds: {},
    marketPriorityIds: [],
    resourceIds: [],
    projectIds: [],
    buildings: readBuildingContext(controls).buildings.map((building) => ({
      vueBinding: building.binding,
      switchable: building.switchable,
    })),
    crafterOriginalIds: [],
    discoveredResetNames: ["resetJobSettings"],
  };
}
