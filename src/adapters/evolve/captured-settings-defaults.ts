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
import { capturedGalaxyOfferIdentities } from "./economy/market/captured-galaxy-market.ts";
import { ALCHEMY_CONTROL_PREFIX } from "./economy/production/captured-alchemy.ts";
import { PYLON_SPELL_IDS } from "./economy/production/captured-pylon.ts";
import { SMELTER_FUEL_IDS } from "./economy/production/captured-smelter.ts";
import { FACTORY_RESOURCE_ID_BY_KEY } from "./economy/production/captured-factory.ts";
import { isReplicableResourceId } from "./economy/production/captured-replicator.ts";
import { isRecord, readProperty } from "../validation.ts";
import {
  readCapturedBuildingBindingMap,
  readCapturedBuildingEntries,
} from "./progression/build/captured-building-catalog.ts";

export interface CapturedSettingsDefaultsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
}

/** The nine crafted resources, shared with the foundry settings table. */
export const CRAFTER_RESOURCE_KEYS = Object.freeze([
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

/** Title-cases a catalog id the way the default priority tables key it. Shared with the captured settings adapters so the one mapping cannot drift. */
export function titleCaseKey(id: string): string {
  return id
    .split(/[_-]/u)
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
}

/**
 * Legacy display keys whose title-cased root id does not match. Upstream names
 * its `arpaProjects` catalog entries `lhc`, `syphon` and `tp_depot`
 * (`src/arpa.js` at the port reference commit); the script's default table
 * still keys them `SuperCollider`, `ManaSyphon` and `Depot`, the way the
 * compatibility project catalog did. Without the alias those three projects
 * silently miss their defaults on the captured path.
 */
const PROJECT_DISPLAY_KEY_ALIASES: Readonly<Record<string, string>> =
  Object.freeze({
    SuperCollider: "lhc",
    ManaSyphon: "syphon",
    Depot: "tp_depot",
  });

export function projectIdByKey(
  projectIds: readonly string[],
): Record<string, string> {
  const present = new Set(projectIds);
  const idByKey: Record<string, string> = {};
  for (const id of projectIds) {
    idByKey[titleCaseKey(id)] = id;
  }
  for (const [displayKey, rawId] of Object.entries(
    PROJECT_DISPLAY_KEY_ALIASES,
  )) {
    if (present.has(rawId) && idByKey[displayKey] === undefined) {
      idByKey[displayKey] = rawId;
    }
  }
  return idByKey;
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

/**
 * The resources the market settings govern, in table order: every resource
 * whose root record is tradable, plus any `market-` row the page captured for
 * a resource the root does not flag. Galaxy offer buy ids come from the same
 * resolved offer identities the galaxy automation clicks. Shared with the
 * captured market settings adapter so the table and the defaults cannot
 * disagree. Previously the galaxy half defaulted to nothing on this path.
 */
export function readMarketResetContext(
  root: unknown,
  controls: GameControlRegistry,
): MarketResetContext {
  return {
    tradableResourceIds: mergeResourceIds(
      root,
      "tradable",
      controls,
      "market-",
    ),
    galaxyOfferResourceIds: capturedGalaxyOfferIdentities(root).map(
      (offer) => offer.buyResourceId,
    ),
  };
}

/**
 * The resources the storage settings govern, in table order: every resource
 * whose root record is stackable, plus any `stack-<id>` row the page captured
 * for a resource the root does not flag. Shared with the captured storage
 * settings adapter so the table and the defaults cannot disagree.
 */
export function readStorageResetContext(
  root: unknown,
  controls: GameControlRegistry,
): StorageResetContext {
  return {
    storableResourceIds: mergeResourceIds(
      root,
      "stackable",
      controls,
      "stack-",
    ),
    orichalcumId: readKnownResourceId(root, "Orichalcum"),
    vitreloyId: readKnownResourceId(root, "Vitreloy"),
    bolognumId: readKnownResourceId(root, "Bolognium"),
  };
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
  return { projectIds, idByKey: projectIdByKey(projectIds) };
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

/**
 * The magic settings catalog: alchemy resources in captured-control order and
 * the fixed ritual set. Shared with the captured magic settings adapter so the
 * table and the defaults cannot disagree. Previously the ritual half defaulted
 * to nothing on this path.
 */
export function readMagicResetContext(
  controls: GameControlRegistry,
): MagicResetContext {
  return {
    alchemyResourceIds: readControlSuffixIds(controls, ALCHEMY_CONTROL_PREFIX),
    ritualProductionIds: [...PYLON_SPELL_IDS],
  };
}

export function readProduction(root: unknown): ProductionResetContext {
  const ids = readResources(root).map(([id]) => id);
  const identityMap = Object.fromEntries(ids.map((id) => [id, id]));
  return {
    foundryResourceIdByKey: identityMap,
    smelterFuelIds: [...SMELTER_FUEL_IDS],
    factoryResourceIdByKey: { ...FACTORY_RESOURCE_ID_BY_KEY },
    droidResourceIdByKey: identityMap,
    replicatorProductionIds: ids.filter((id) => isReplicableResourceId(id)),
  };
}

export function readEjector(
  root: unknown,
  controls: GameControlRegistry,
): EjectorResetContext {
  const capturedIds = new Set(controls.capturedElementIds());
  const atomicMasses = readProperty(root, "atomic_mass");
  const supplyValues = readProperty(root, "supplyValue");
  const readSupplyFigure = (
    resource: Record<string, unknown>,
    id: string,
    resourceField: string,
    supplyField: string,
  ): number => {
    if (typeof readProperty(resource, resourceField) === "number") {
      return readProperty(resource, resourceField) as number;
    }
    const supply = readProperty(supplyValues, id);
    if (typeof supply === "number") return supply;
    const nested = isRecord(supply)
      ? readProperty(supply, supplyField)
      : undefined;
    return typeof nested === "number" ? nested : 0;
  };
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
    supplyIn: readSupplyFigure(resource, id, "supplyIn", "in"),
    supplyOut: readSupplyFigure(resource, id, "supplyOut", "out"),
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
    readMarket: (): MarketResetContext =>
      readMarketResetContext(readRootSafely(rootState), controls),
    readStorage: (): StorageResetContext =>
      readStorageResetContext(readRootSafely(rootState), controls),
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
    readMagic: (): MagicResetContext => readMagicResetContext(controls),
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
