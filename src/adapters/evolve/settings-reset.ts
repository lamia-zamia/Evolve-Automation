// Evolve adapter for the settings-reset slice: samples each defaults section's narrow live
// catalog (reader) and performs the manager mutations a reset owns (effects). This replaces
// the getter-bag proxies in the legacy `reset-settings.ts`; the pure defaults tables and the
// application orchestration never touch a live manager.
//
// Adapter-edge values are described only by the fields this reset slice samples. The live
// game remains dynamic, but those details stop at these narrow compatibility interfaces.

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
  PriorityManagerKey,
  ProductionResetContext,
  ProjectResetContext,
  StorageResetContext,
} from "../../domain/settings-defaults.ts";
import type {
  SettingsResetEffects,
  SettingsResetReader,
} from "../../ports/settings-reset.ts";

interface ResetResource {
  id: string;
  is: { tradable?: boolean };
  hasStorage: () => boolean;
  atomicMass: number;
}

interface ResetResources extends Record<string, ResetResource> {
  Bolognium: ResetResource;
  Elerium: ResetResource;
  Infernite: ResetResource;
  Orichalcum: ResetResource;
  Vitreloy: ResetResource;
}

interface ResetTrait {
  type: string;
}

interface ResetGame {
  traits: Record<string, ResetTrait>;
  global: { race: { universe: string } };
}

interface ResetPoly {
  galaxyOffers: Array<{ buy: { res: string } }>;
  neg_roll_traits: string[];
  genus_traits: Record<string, unknown>;
}

interface PriorityManager {
  priorityList: unknown[];
  sortByPriority: () => void;
}

interface GovernmentManager {
  Types: {
    democracy: { id: string };
    technocracy: { id: string };
    corpocracy: { id: string };
  };
}

interface BuildingView {
  _vueBinding: string;
  isSwitchable: () => boolean;
  is: { smart?: boolean };
}

interface BuildingManager extends PriorityManager {
  priorityList: BuildingView[];
}

interface ResetJob {
  _originalId: string;
  is: { smart?: boolean };
}

interface ResetProject {
  id: string;
}

interface ProductionView {
  resource: ResetResource;
}

interface ProductionManager {
  Productions: Record<string, ProductionView>;
}

interface SmelterManager {
  Fuels: Record<string, { id: string }>;
}

interface ReplicatorManager {
  Productions: Record<string, { id: string }>;
}

interface AlchemyManager extends PriorityManager {
  transmuteTier: (resource: ResetResource) => number;
}

interface RitualManager {
  Productions: Record<string, { id: string }>;
}

interface DisposalManager extends PriorityManager {
  isConsumable: (resource: ResetResource) => boolean;
  supplyIn?: (id: string) => number;
}

interface TraitInstance {
  traitName: string;
  type: "major" | "genus";
  genus: string;
  isGainable: () => boolean;
}

interface TraitConstructor {
  new (id: string): TraitInstance;
}

interface TriggerManager extends PriorityManager {
  AddTrigger: (
    requirementType: string,
    requirementId: string,
    requirementCount: number,
    actionType: string,
    actionId: string,
    actionCount: number,
  ) => unknown;
}

/** Getters for the live managers/catalogs each reset section reads, resolved at sample time. */
export interface SettingsResetAdapterDependencies {
  AlchemyManager: () => AlchemyManager;
  biomeList: () => string[];
  BuildingManager: () => BuildingManager;
  buildings: () => Record<string, BuildingView>;
  challenges: () => Array<Array<{ id: string }>>;
  DroidManager: () => ProductionManager;
  EjectManager: () => DisposalManager;
  extraList: () => string[];
  FactoryManager: () => ProductionManager;
  game: () => ResetGame;
  GameLog: () => { Types: Record<string, unknown> };
  GenusTrait: () => TraitConstructor;
  GovernmentManager: () => GovernmentManager;
  initBuildingState: () => () => void;
  JobManager: () => PriorityManager;
  jobs: () => Record<string, ResetJob>;
  MajorTrait: () => TraitConstructor;
  MarketManager: () => PriorityManager;
  MinorTrait: () => TraitConstructor;
  MinorTraitManager: () => PriorityManager;
  MutableTraitManager: () => PriorityManager;
  NaniteManager: () => DisposalManager;
  ocularPowerData: () => Record<string, { id: string }>;
  planetBiomes: () => string[];
  planetTraits: () => string[];
  poly: () => ResetPoly;
  ProjectManager: () => PriorityManager;
  projects: () => Record<string, ResetProject>;
  ReplicatorManager: () => ReplicatorManager;
  resources: () => ResetResources;
  RitualManager: () => RitualManager;
  SmelterManager: () => SmelterManager;
  StorageManager: () => PriorityManager;
  SupplyManager: () => DisposalManager;
  traitList: () => string[];
  TriggerManager: () => TriggerManager;
}

export function createEvolveSettingsResetAdapter(
  dependencies: SettingsResetAdapterDependencies,
): { reader: SettingsResetReader; effects: SettingsResetEffects } {
  const d = dependencies;

  const reader: SettingsResetReader = {
    readGovernment(): GovernmentResetContext {
      const types = d.GovernmentManager().Types;
      return {
        democracyId: types.democracy.id,
        technocracyId: types.technocracy.id,
        corpocracyId: types.corpocracy.id,
      };
    },

    readEvolution(): EvolutionResetContext {
      return { challengeIds: d.challenges().map((set) => set[0]!.id) };
    },

    readLogging(): LoggingResetContext {
      return { gameLogTypeIds: Object.keys(d.GameLog().Types) };
    },

    readPlanet(): PlanetResetContext {
      return {
        biomeList: d.biomeList(),
        planetBiomes: d.planetBiomes(),
        traitList: d.traitList(),
        planetTraits: d.planetTraits(),
        extraList: d.extraList(),
      };
    },

    readMarket(): MarketResetContext {
      const resources = d.resources();
      const poly = d.poly();
      return {
        tradableResourceIds: Object.values(resources)
          .filter((r) => r.is.tradable)
          .map((r) => r.id),
        galaxyOfferResourceIds: poly.galaxyOffers.map(
          (offer) => resources[offer.buy.res]!.id,
        ),
      };
    },

    readStorage(): StorageResetContext {
      const resources = d.resources();
      return {
        storableResourceIds: Object.values(resources)
          .filter((r) => r.hasStorage())
          .map((r) => r.id),
        orichalcumId: resources.Orichalcum.id,
        vitreloyId: resources.Vitreloy.id,
        bolognumId: resources.Bolognium.id,
      };
    },

    readMinorTrait(): MinorTraitResetContext {
      const game = d.game();
      // Legacy builds `new MinorTrait(id)` and keys defaults by its `traitName`, which the
      // constructor sets to the id; so the filtered game.traits ids are the trait names.
      const traitNames = Object.entries(game.traits)
        .filter(
          ([id, trait]) =>
            trait.type === "minor" || id === "mastery" || id === "fortify",
        )
        .map(([id]) => id);
      const ocularPowerIds = Object.values(d.ocularPowerData()).map(
        (v) => v.id,
      );
      return { traitNames, ocularPowerIds };
    },

    readMutableTrait(): MutableTraitResetContext {
      const game = d.game();
      const poly = d.poly();
      const MajorTrait = d.MajorTrait();
      const GenusTrait = d.GenusTrait();
      const unobtainableTraits = ["xenophobic", "rigid", "soul_eater"];
      const traits = Object.entries(game.traits)
        .filter(
          ([id, trait]) =>
            (trait.type === "major" || trait.type === "genus") &&
            !unobtainableTraits.includes(id),
        )
        .map(([id, trait]) => {
          const built =
            trait.type === "major" ? new MajorTrait(id) : new GenusTrait(id);
          return {
            traitName: built.traitName,
            type: built.type as "major" | "genus",
            genus: built.genus,
            isGainable: built.isGainable(),
            isNegRoll: poly.neg_roll_traits.includes(id),
          };
        });
      return { traits, genusOrder: Object.keys(poly.genus_traits) };
    },

    readJob(): JobResetContext {
      const jobs = Object.entries(d.jobs()).map(([key, job]) => ({
        key,
        originalId: job._originalId,
        isSmart: Boolean(job.is.smart),
      }));
      return { jobs };
    },

    readBuilding(): BuildingResetContext {
      const buildingsMap = d.buildings();
      const buildings = d.BuildingManager().priorityList.map((building) => ({
        binding: building._vueBinding,
        switchable: building.isSwitchable(),
        smart: Boolean(building.is.smart),
      }));
      const bindingByKey: Record<string, string> = {};
      Object.entries(buildingsMap).forEach(
        ([key, building]) => (bindingByKey[key] = building._vueBinding),
      );
      return { buildings, bindingByKey };
    },

    readProject(): ProjectResetContext {
      const projectsMap = d.projects();
      const idByKey: Record<string, string> = {};
      Object.entries(projectsMap).forEach(
        ([key, project]) => (idByKey[key] = project.id),
      );
      return {
        projectIds: Object.values(projectsMap).map((p) => p.id),
        idByKey,
      };
    },

    readMagic(): MagicResetContext {
      const AlchemyManager = d.AlchemyManager();
      return {
        alchemyResourceIds: Object.values(d.resources())
          .filter((r) => AlchemyManager.transmuteTier(r) > 0)
          .map((r) => r.id),
        ritualProductionIds: Object.values(d.RitualManager().Productions).map(
          (spell) => spell.id,
        ),
      };
    },

    readProduction(): ProductionResetContext {
      const foundryResourceIdByKey: Record<string, string> = {};
      Object.entries(d.resources()).forEach(
        ([key, resource]) => (foundryResourceIdByKey[key] = resource.id),
      );
      const factoryResourceIdByKey: Record<string, string> = {};
      Object.entries(d.FactoryManager().Productions).forEach(
        ([key, production]) =>
          (factoryResourceIdByKey[key] = production.resource.id),
      );
      const droidResourceIdByKey: Record<string, string> = {};
      Object.entries(d.DroidManager().Productions).forEach(
        ([key, production]) =>
          (droidResourceIdByKey[key] = production.resource.id),
      );
      return {
        foundryResourceIdByKey,
        smelterFuelIds: Object.values(d.SmelterManager().Fuels).map(
          (fuel) => fuel.id,
        ),
        factoryResourceIdByKey,
        droidResourceIdByKey,
        replicatorProductionIds: Object.values(
          d.ReplicatorManager().Productions,
        ).map((production) => production.id),
      };
    },

    readEjector(): EjectorResetContext {
      const resources = d.resources();
      const EjectManager = d.EjectManager();
      const SupplyManager = d.SupplyManager();
      const NaniteManager = d.NaniteManager();
      const descriptors = Object.values(resources).map((r) => {
        const supplyConsumable = SupplyManager.isConsumable(r);
        return {
          id: r.id,
          isTradable: r.is.tradable ?? false,
          atomicMass: r.atomicMass,
          ejectConsumable: EjectManager.isConsumable(r),
          supplyConsumable,
          naniteConsumable: NaniteManager.isConsumable(r),
          // supplyIn is only consulted for the supply list; guard non-supply resources.
          supplyIn: supplyConsumable ? SupplyManager.supplyIn!(r.id) : 0,
        };
      });
      return {
        universe: d.game().global.race.universe,
        resources: descriptors,
        eleriumId: resources.Elerium.id,
        inferniteId: resources.Infernite.id,
      };
    },
  };

  const managerFor = (manager: PriorityManagerKey): PriorityManager => {
    switch (manager) {
      case "market":
        return d.MarketManager();
      case "storage":
        return d.StorageManager();
      case "job":
        return d.JobManager();
      case "building":
        return d.BuildingManager();
      case "minorTrait":
        return d.MinorTraitManager();
      case "mutableTrait":
        return d.MutableTraitManager();
      case "project":
        return d.ProjectManager();
      case "alchemy":
        return d.AlchemyManager();
      case "eject":
        return d.EjectManager();
      case "supply":
        return d.SupplyManager();
      case "nanite":
        return d.NaniteManager();
    }
  };

  const reconstruct = (
    manager: PriorityManagerKey,
    ids: readonly string[],
  ): unknown[] => {
    switch (manager) {
      case "market":
      case "storage":
      case "alchemy":
      case "eject":
      case "supply":
      case "nanite": {
        const byId = new Map(
          Object.values(d.resources()).map((r) => [r.id, r] as const),
        );
        return ids.map((id) => byId.get(id));
      }
      case "job": {
        const byId = new Map(
          Object.values(d.jobs()).map((job) => [job._originalId, job] as const),
        );
        return ids.map((id) => byId.get(id));
      }
      case "project": {
        const byId = new Map(
          Object.values(d.projects()).map((p) => [p.id, p] as const),
        );
        return ids.map((id) => byId.get(id));
      }
      case "minorTrait": {
        const MinorTrait = d.MinorTrait();
        return ids.map((id) => new MinorTrait(id));
      }
      case "mutableTrait": {
        const game = d.game();
        const MajorTrait = d.MajorTrait();
        const GenusTrait = d.GenusTrait();
        return ids.map((id) =>
          game.traits[id]!.type === "major"
            ? new MajorTrait(id)
            : new GenusTrait(id),
        );
      }
      case "building":
        // Building never reassigns its priority list (initBuildingState populates it).
        return [];
    }
  };

  const effects: SettingsResetEffects = {
    setPriorityList(manager, orderedIds) {
      managerFor(manager).priorityList = reconstruct(manager, orderedIds);
    },
    sortByPriority(manager) {
      managerFor(manager).sortByPriority();
    },
    initBuildingState() {
      d.initBuildingState()();
    },
    rebuildDefaultTriggers() {
      const TriggerManager = d.TriggerManager();
      TriggerManager.priorityList = [];
      TriggerManager.AddTrigger(
        "BuildingCount",
        "space-moon_mission",
        1,
        "build",
        "space-moon_base",
        1,
      );
      TriggerManager.AddTrigger(
        "BuildingCount",
        "space-moon_base",
        1,
        "build",
        "space-iridium_mine",
        1,
      );
      TriggerManager.AddTrigger(
        "BuildingCount",
        "space-moon_base",
        1,
        "build",
        "space-helium_mine",
        1,
      );
      return JSON.parse(JSON.stringify(TriggerManager.priorityList));
    },
  };

  return { reader, effects };
}
