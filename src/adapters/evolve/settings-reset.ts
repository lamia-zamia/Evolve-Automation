// Evolve adapter for the settings-reset slice: samples each defaults section's narrow live
// catalog (reader) and performs the manager mutations a reset owns (effects). This replaces
// the getter-bag proxies in the legacy `reset-settings.ts`; the pure defaults tables and the
// application orchestration never touch a live manager.
//
// Adapter-edge exception: game objects, managers and the trait constructors are untyped
// external surfaces, so `Loose` is `any` here and does not escape this file.

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

/** Getters for the live managers/catalogs each reset section reads, resolved at sample time. */
export interface SettingsResetAdapterDependencies {
  AlchemyManager: () => Loose;
  biomeList: () => Loose[];
  BuildingManager: () => Loose;
  buildings: () => Record<string, Loose>;
  challenges: () => Loose[];
  DroidManager: () => Loose;
  EjectManager: () => Loose;
  extraList: () => Loose[];
  FactoryManager: () => Loose;
  game: () => Loose;
  GameLog: () => Loose;
  GenusTrait: () => Loose;
  GovernmentManager: () => Loose;
  initBuildingState: () => () => void;
  JobManager: () => Loose;
  jobs: () => Record<string, Loose>;
  MajorTrait: () => Loose;
  MarketManager: () => Loose;
  MinorTrait: () => Loose;
  MinorTraitManager: () => Loose;
  MutableTraitManager: () => Loose;
  NaniteManager: () => Loose;
  ocularPowerData: () => Record<string, Loose>;
  planetBiomes: () => Loose[];
  planetTraits: () => Loose[];
  poly: () => Loose;
  ProjectManager: () => Loose;
  projects: () => Record<string, Loose>;
  ReplicatorManager: () => Loose;
  resources: () => Record<string, Loose>;
  RitualManager: () => Loose;
  SmelterManager: () => Loose;
  StorageManager: () => Loose;
  SupplyManager: () => Loose;
  traitList: () => Loose[];
  TriggerManager: () => Loose;
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
      return { challengeIds: d.challenges().map((set: Loose) => set[0].id) };
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
          .filter((r: Loose) => r.is.tradable)
          .map((r: Loose) => r.id),
        galaxyOfferResourceIds: poly.galaxyOffers.map(
          (offer: Loose) => resources[offer.buy.res].id,
        ),
      };
    },

    readStorage(): StorageResetContext {
      const resources = d.resources();
      return {
        storableResourceIds: Object.values(resources)
          .filter((r: Loose) => r.hasStorage())
          .map((r: Loose) => r.id),
        orichalcumId: resources.Orichalcum.id,
        vitreloyId: resources.Vitreloy.id,
        bolognumId: resources.Bolognium.id,
      };
    },

    readMinorTrait(): MinorTraitResetContext {
      const game = d.game();
      // Legacy builds `new MinorTrait(id)` and keys defaults by its `traitName`, which the
      // constructor sets to the id; so the filtered game.traits ids are the trait names.
      const traitNames = (Object.entries(game.traits) as [string, Loose][])
        .filter(
          ([id, trait]) =>
            trait.type === "minor" || id === "mastery" || id === "fortify",
        )
        .map(([id]) => id);
      const ocularPowerIds = Object.values(d.ocularPowerData()).map(
        (v: Loose) => v.id,
      );
      return { traitNames, ocularPowerIds };
    },

    readMutableTrait(): MutableTraitResetContext {
      const game = d.game();
      const poly = d.poly();
      const MajorTrait = d.MajorTrait();
      const GenusTrait = d.GenusTrait();
      const unobtainableTraits = ["xenophobic", "rigid", "soul_eater"];
      const traits = (Object.entries(game.traits) as [string, Loose][])
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
      const buildings = d
        .BuildingManager()
        .priorityList.map((building: Loose) => ({
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
        projectIds: Object.values(projectsMap).map((p: Loose) => p.id),
        idByKey,
      };
    },

    readMagic(): MagicResetContext {
      const AlchemyManager = d.AlchemyManager();
      return {
        alchemyResourceIds: Object.values(d.resources())
          .filter((r: Loose) => AlchemyManager.transmuteTier(r) > 0)
          .map((r: Loose) => r.id),
        ritualProductionIds: Object.values(d.RitualManager().Productions).map(
          (spell: Loose) => spell.id,
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
          (factoryResourceIdByKey[key] = (production as Loose).resource.id),
      );
      const droidResourceIdByKey: Record<string, string> = {};
      Object.entries(d.DroidManager().Productions).forEach(
        ([key, production]) =>
          (droidResourceIdByKey[key] = (production as Loose).resource.id),
      );
      return {
        foundryResourceIdByKey,
        smelterFuelIds: Object.values(d.SmelterManager().Fuels).map(
          (fuel: Loose) => fuel.id,
        ),
        factoryResourceIdByKey,
        droidResourceIdByKey,
        replicatorProductionIds: Object.values(
          d.ReplicatorManager().Productions,
        ).map((production: Loose) => production.id),
      };
    },

    readEjector(): EjectorResetContext {
      const resources = d.resources();
      const EjectManager = d.EjectManager();
      const SupplyManager = d.SupplyManager();
      const NaniteManager = d.NaniteManager();
      const descriptors = Object.values(resources).map((r: Loose) => {
        const supplyConsumable = SupplyManager.isConsumable(r);
        return {
          id: r.id,
          isTradable: r.is.tradable ?? false,
          atomicMass: r.atomicMass,
          ejectConsumable: EjectManager.isConsumable(r),
          supplyConsumable,
          naniteConsumable: NaniteManager.isConsumable(r),
          // supplyIn is only consulted for the supply list; guard non-supply resources.
          supplyIn: supplyConsumable ? SupplyManager.supplyIn(r.id) : 0,
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

  const managerFor = (manager: PriorityManagerKey): Loose => {
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
  ): Loose[] => {
    switch (manager) {
      case "market":
      case "storage":
      case "alchemy":
      case "eject":
      case "supply":
      case "nanite": {
        const byId = new Map(
          Object.values(d.resources()).map((r: Loose) => [r.id, r]),
        );
        return ids.map((id) => byId.get(id));
      }
      case "job": {
        const byId = new Map(
          Object.values(d.jobs()).map((job: Loose) => [job._originalId, job]),
        );
        return ids.map((id) => byId.get(id));
      }
      case "project": {
        const byId = new Map(
          Object.values(d.projects()).map((p: Loose) => [p.id, p]),
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
          game.traits[id].type === "major"
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
