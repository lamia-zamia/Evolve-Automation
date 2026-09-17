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
import type {
  CapturedSettingsDefaults,
  CapturedSettingsMigrationCatalogs,
} from "../../ports/captured-settings-defaults.ts";
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
import { ALCHEMY_CONTROL_PREFIX } from "./economy/production/captured-alchemy.ts";
import { isRecord, readProperty } from "../validation.ts";
import {
  readCapturedBuildingBindingMap,
  readCapturedBuildingEntries,
} from "./progression/build/captured-building-catalog.ts";

export interface CapturedSettingsDefaultsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
}

const CRAFTER_RESOURCE_KEYS = Object.freeze([
  "Plywood",
  "Brick",
  "Wrought_Iron",
  "Sheet_Metal",
  "Mythril",
  "Aerogel",
  "Nanoweave",
  "Scarletite",
  "Quantium",
]);

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

function readResourceControlIds(
  root: unknown,
  controls: GameControlRegistry,
  prefix: string,
): readonly string[] {
  const resourceIds = new Set(readResources(root).map(([id]) => id));
  const result: string[] = [];
  for (const controlId of controls.capturedElementIds()) {
    if (!controlId.startsWith(prefix)) continue;
    const resourceId = controlId.slice(prefix.length);
    if (resourceId.length > 0 && resourceIds.has(resourceId)) {
      result.push(resourceId);
    }
  }
  return result;
}

function mergeResourceIds(
  root: unknown,
  property: string,
  controls: GameControlRegistry,
  controlPrefix: string,
): readonly string[] {
  const result = [...readResourceIds(root, property)];
  const seen = new Set(result);
  for (const id of readResourceControlIds(root, controls, controlPrefix)) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function readTechIds(root: unknown): Record<string, unknown> {
  const tech = readProperty(root, "tech");
  if (!isRecord(tech)) return {};
  const result: Record<string, unknown> = {};
  for (const id of Object.keys(tech)) {
    result[id.startsWith("tech-") ? id : "tech-" + id] = true;
  }
  return result;
}

function readControlSuffixIds(
  controls: GameControlRegistry,
  prefix: string,
): readonly string[] {
  return controls
    .capturedElementIds()
    .filter((id) => id.startsWith(prefix) && id.length > prefix.length)
    .map((id) => id.slice(prefix.length))
    .filter((id, index, ids) => ids.indexOf(id) === index);
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
  const projects = readProperty(root, "arpa");
  const projectIds = isRecord(projects)
    ? Object.keys(projects).filter((id) => id !== "sequence")
    : [];
  const idByKey: Record<string, string> = {};
  projectIds.forEach((id) => {
    idByKey[titleCaseKey(id)] = id;
  });
  return { projectIds, idByKey };
}

function readBuildingContext(
  root: unknown,
  controls: GameControlRegistry,
): BuildingResetContext {
  const entries = readCapturedBuildingEntries(root, controls);
  return {
    buildings: entries.map((entry) => ({
      binding: entry.binding,
      switchable: entry.switchable,
      smart: entry.smart,
    })),
    bindingByKey: readCapturedBuildingBindingMap(entries),
  };
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

function readEjector(
  root: unknown,
  controls: GameControlRegistry,
): EjectorResetContext {
  const capturedIds = new Set(controls.capturedElementIds());
  const atomicMasses = readProperty(root, "atomic_mass");
  const supplyValues = readProperty(root, "supplyValue");
  const resources = readResources(root).map(([id, resource]) => ({
    id,
    // DeadSpace keeps tradability in the module-local resource table; a rendered market row is
    // the captured proof available here. Retain the root/nested forms for compatible builds.
    isTradable:
      readProperty(resource, "tradable") === true ||
      readProperty(readProperty(resource, "is"), "tradable") === true ||
      capturedIds.has("market-" + id),
    atomicMass:
      typeof readProperty(resource, "atomicMass") === "number"
        ? (readProperty(resource, "atomicMass") as number)
        : typeof readProperty(atomicMasses, id) === "number"
          ? (readProperty(atomicMasses, id) as number)
          : 0,
    ejectConsumable: capturedIds.has("eject" + id),
    supplyConsumable: capturedIds.has("supply" + id),
    naniteConsumable: isRecord(
      readProperty(readProperty(root, "city"), "nanite_factory"),
    )
      ? Object.hasOwn(
          readProperty(readProperty(root, "city"), "nanite_factory") as object,
          id,
        )
      : false,
    supplyIn:
      typeof readProperty(resource, "supplyIn") === "number"
        ? (readProperty(resource, "supplyIn") as number)
        : typeof readProperty(supplyValues, id) === "number"
          ? (readProperty(supplyValues, id) as number)
          : isRecord(readProperty(supplyValues, id)) &&
              typeof readProperty(readProperty(supplyValues, id), "in") ===
                "number"
            ? (readProperty(readProperty(supplyValues, id), "in") as number)
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
      tradableResourceIds: mergeResourceIds(
        readRootSafely(rootState),
        "tradable",
        controls,
        "market-",
      ),
      galaxyOfferResourceIds: [],
    }),
    readStorage: (): StorageResetContext => ({
      storableResourceIds: mergeResourceIds(
        readRootSafely(rootState),
        "stackable",
        controls,
        "stack-",
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
    readBuilding: () =>
      readBuildingContext(readRootSafely(rootState), controls),
    readProject: () => readProjects(readRootSafely(rootState)),
    readMagic: (): MagicResetContext => ({
      alchemyResourceIds: readControlSuffixIds(
        controls,
        ALCHEMY_CONTROL_PREFIX,
      ),
      ritualProductionIds: [],
    }),
    readProduction: () => readProduction(readRootSafely(rootState)),
    readEjector: () => readEjector(readRootSafely(rootState), controls),
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

  const readMigrationCatalogs = (): CapturedSettingsMigrationCatalogs => {
    const root = readRootSafely(rootState);
    const buildingContext = readBuildingContext(root, controls);
    const productionContext = readProduction(root);
    const foundryResourceIds = new Set(
      Object.values(productionContext.foundryResourceIdByKey),
    );
    return {
      techIds: readTechIds(root),
      marketPriorityIds: mergeResourceIds(
        root,
        "tradable",
        controls,
        "market-",
      ),
      resourceIds: readResources(root).map(([id]) => id),
      projectIds: readProjects(root).projectIds,
      buildings: buildingContext.buildings.map((building) => ({
        vueBinding: building.binding,
        switchable: building.switchable,
      })),
      crafterOriginalIds: CRAFTER_RESOURCE_KEYS.filter((key) =>
        foundryResourceIds.has(key),
      ),
    };
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
    buildings: readBuildingContext(
      readRootSafely(rootState),
      controls,
    ).buildings.map((building) => ({
      vueBinding: building.binding,
      switchable: building.switchable,
    })),
    crafterOriginalIds: CRAFTER_RESOURCE_KEYS.filter((key) =>
      Object.hasOwn(
        readProduction(readRootSafely(rootState)).foundryResourceIdByKey,
        key,
      ),
    ),
    discoveredResetNames: [
      "resetBuildingSettings",
      "resetMarketSettings",
      "resetStorageSettings",
      "resetProjectSettings",
      "resetJobSettings",
      "resetMagicSettings",
      "resetProductionSettings",
      "resetEjectorSettings",
    ],
    readMigrationCatalogs,
  };
}
