import { crateCost } from "../domain/economy/storage/crate-cost.ts";

/**
 * A resource entity. This module routes them into building consumption and
 * support, and writes the crate and container cost bags.
 */
type ResourceEntity = { cost: Record<string, number> };

/** A crafting job entity. Only collected into the job manager's list here. */
type JobEntity = object;

type BuildingEntity = {
  id: string;
  name: string;
  /** The game action behind the building, absent when this build does not ship it. */
  definition: unknown;
  gameMax: number;
  powered: number;
  overridePowered: number;
  produces: ResourceEntity[];
  autoStateSmart: boolean;
  _tab: string;
  _location: string;
  addSupport(resource: ResourceEntity): void;
  addResourceConsumption(
    resource: ResourceEntity | (() => ResourceEntity),
    rate: number | (() => number),
  ): void;
};

/** An ARPA project. Only its build ceiling is set here. */
type ProjectEntity = { gameMax: number };

type StateBuildingId =
  | "Alien1Consulate"
  | "Alien1SuperFreighter"
  | "Alien1VitreloyPlant"
  | "Alien2ArmedMiner"
  | "Alien2Foothold"
  | "Alien2OreProcessor"
  | "Alien2Scavenger"
  | "AlphaExchange"
  | "AlphaExoticZoo"
  | "AlphaFusion"
  | "AlphaGraphenePlant"
  | "AlphaHabitat"
  | "AlphaLaboratory"
  | "AlphaMegaFactory"
  | "AlphaMiningDroid"
  | "AlphaProcessing"
  | "AlphaStarport"
  | "AsphodelBlissDen"
  | "AsphodelBunker"
  | "AsphodelCorruptor"
  | "AsphodelEncampment"
  | "AsphodelHarvester"
  | "AsphodelMechStation"
  | "AsphodelProcessor"
  | "AsphodelRectory"
  | "AsphodelResearchStation"
  | "AsphodelRuneGate"
  | "AsphodelSoulEngine"
  | "Assembly"
  | "BadlandsCodex"
  | "Banquet"
  | "BeltEleriumShip"
  | "BeltIridiumShip"
  | "BeltIronShip"
  | "BeltSpaceStation"
  | "BlackholeStargate"
  | "BlackholeStargateComplete"
  | "BlackholeStellarEngine"
  | "BologniumShip"
  | "ChthonianMineLayer"
  | "ChthonianRaider"
  | "CoalMine"
  | "CoalPower"
  | "CorvetteShip"
  | "CruiserShip"
  | "Dreadnought"
  | "DwarfEleriumReactor"
  | "DwarfMassRelay"
  | "DwarfMassRelayComplete"
  | "DwarfShipyard"
  | "DwarfWorldCollider"
  | "DwarfWorldController"
  | "ElysiumFireSupportBase"
  | "ElysiumNorthPier"
  | "ElysiumReincarnation"
  | "ElysiumRushmore"
  | "EnceladusBase"
  | "EnceladusWaterFreighter"
  | "EnceladusZeroGLab"
  | "ErisDrone"
  | "ErisTank"
  | "ErisTrooper"
  | "FissionPower"
  | "FrigateShip"
  | "GasMining"
  | "GasMoonOilExtractor"
  | "GasMoonOutpost"
  | "GasSpaceDock"
  | "GasSpaceDockShipSegment"
  | "GateEastTower"
  | "GatewayShipDock"
  | "GatewayStarbase"
  | "GateWestTower"
  | "GorddonEmbassy"
  | "GorddonFreighter"
  | "HellGeothermal"
  | "IsleSoulCompactor"
  | "IsleSouthPier"
  | "MakemakeElerium"
  | "MakemakeNeutronium"
  | "MakemakeOrichalcum"
  | "MakemakeUranium"
  | "LakeBireme"
  | "LakeHarbor"
  | "LakeOven"
  | "LakeOvenComplete"
  | "LakeTransport"
  | "MoonBase"
  | "MoonHeliumMine"
  | "MoonIridiumMine"
  | "MoonObservatory"
  | "NebulaEleriumProspector"
  | "NebulaHarvester"
  | "NebulaNexus"
  | "NeutronMiner"
  | "OilPower"
  | "PalaceConduit"
  | "PalaceInfuser"
  | "PalaceTomb"
  | "PitAbsorptionChamber"
  | "PitSoulCapacitor"
  | "PitSoulForge"
  | "ProximaCruiser"
  | "ProximaDyson"
  | "ProximaDysonSphere"
  | "ProximaElysaniteSphere"
  | "ProximaOrichalcumSphere"
  | "ProximaTransferStation"
  | "RedAssembly"
  | "RedAtmoTerraformer"
  | "RedBiodome"
  | "RedExoticLab"
  | "RedFabrication"
  | "RedFactory"
  | "RedLivingQuarters"
  | "RedMine"
  | "RedSpaceBarracks"
  | "RedSpaceport"
  | "RedTerraform"
  | "RedTerraformer"
  | "RedTower"
  | "RedVrCenter"
  | "RuinsInfernoPower"
  | "RuinsVault"
  | "RuinsWarVault"
  | "SacrificialAltar"
  | "ScoutShip"
  | "SiriusAscensionMachine"
  | "SiriusAscensionTrigger"
  | "SiriusGravityDome"
  | "SiriusSpaceElevator"
  | "SpaceNavBeacon"
  | "SpireBaseCamp"
  | "SpireBridge"
  | "SpireEdenicGate"
  | "SpireMechBay"
  | "SpirePort"
  | "SpirePurifier"
  | "StargateStation"
  | "StargateTelemetryBeacon"
  | "SunJumpGate"
  | "SunSwarmControl"
  | "SunSwarmSatellite"
  | "TauAlienOutpost"
  | "TauBeltMiningShip"
  | "TauBeltPatrolShip"
  | "TauBeltWhalingShip"
  | "TauColony"
  | "TauCulturalCenter"
  | "TauDiseaseLab"
  | "TauFactory"
  | "TauFarm"
  | "TauFusionGenerator"
  | "TauGas2AlienSpaceStation"
  | "TauGas2AlienStation"
  | "TauGas2IgnitionDevice"
  | "TauGas2MatrioshkaBrain"
  | "TauJumpGate"
  | "TauMiningPit"
  | "TauOrbitalStation"
  | "TauRedOrbitalPlatform"
  | "TauRedOverseer"
  | "TauRedWomlingFarm"
  | "TauRedWomlingFun"
  | "TauRedWomlingLab"
  | "TauRedWomlingMine"
  | "TauRedWomlingVillage"
  | "TauStarMatrix"
  | "TauStarRingworld"
  | "TitanAI"
  | "TitanAIComplete"
  | "TitanDecoder"
  | "TitanElectrolysis"
  | "TitanGraphene"
  | "TitanHydrogen"
  | "TitanMine"
  | "TitanQuarters"
  | "TitanSpaceport"
  | "TouristCenter"
  | "TritonFOB"
  | "TritonLander"
  | "WastelandIncinerator"
  | "WastelandThrone"
  | "Windmill";
type StateResourceId =
  | "Alien_Support"
  | "Alpha_Support"
  | "Asphodel_Support"
  | "Belt_Support"
  | "Bolognium"
  | "Cipher"
  | "Coal"
  | "Containers"
  | "Crates"
  | "Deuterium"
  | "Electrolysis_Support"
  | "Elerium"
  | "Enceladus_Support"
  | "Eris_Support"
  | "Food"
  | "Gateway_Support"
  | "Helium_3"
  | "Infernite"
  | "Lake_Support"
  | "Mana"
  | "Money"
  | "Moon_Support"
  | "Nebula_Support"
  | "Oil"
  | "Red_Support"
  | "Spire_Support"
  | "Stanene"
  | "Sun_Support"
  | "Tau_Belt_Support"
  | "Tau_Red_Support"
  | "Tau_Support"
  | "Titan_Support"
  | "Uranium"
  | "Water"
  | "Womlings_Support";
type BuildingCatalog = Record<string, BuildingEntity> &
  Record<StateBuildingId, BuildingEntity>;
type ResourceCatalog = Record<string, ResourceEntity> &
  Record<StateResourceId, ResourceEntity>;
type ProjectCatalog = Record<string, ProjectEntity> & {
  LaunchFacility: ProjectEntity;
  ManaSyphon: ProjectEntity;
};

type JobManagerShape = { craftingJobs: JobEntity[] };

type GameSurface = {
  global: {
    race: Record<string, unknown> & { universe?: string };
    stats: { achieve: Record<string, { l: number } | undefined> };
    /** Ids of the buildings the game's own power calculation covers. */
    power: string[];
  };
};

type StateInitializationDependencies = {
  getGame: () => GameSurface;
  getResources: () => ResourceCatalog;
  getJobManager: () => JobManagerShape;
  getCrafter: () => Record<string, JobEntity>;
  getBuildings: () => BuildingCatalog;
  setBuildings: (buildings: Record<string, BuildingEntity>) => void;
  getProjects: () => ProjectCatalog;
  getUpdateCraftCost: () => () => void;
  getUpdateTabs: () => (redraw: boolean) => void;
  getHaveTech: () => (id: string, level?: number) => unknown;
  log: (message: string) => void;
};

export function createStateInitialization({
  getGame,
  getResources,
  getJobManager,
  getCrafter,
  getBuildings,
  setBuildings,
  getProjects,
  getUpdateCraftCost,
  getUpdateTabs,
  getHaveTech,
  log,
}: StateInitializationDependencies) {
  const updateCraftCost = () => getUpdateCraftCost()();
  const updateTabs = (redraw: boolean) => getUpdateTabs()(redraw);
  const haveTech = (id: string, level?: number) => getHaveTech()(id, level);

  function initialiseState() {
    const JobManager = getJobManager();
    const crafter = getCrafter();

    updateCraftCost();
    updateTabs(false);

    // Lets set our crate / container resource requirements
    Object.defineProperty(getResources().Crates, "cost", {
      get: () => {
        const race = getGame().global.race;
        return crateCost({
          smoldering: Boolean(race["smoldering"]),
          kindlingKindred: Boolean(race["kindling_kindred"]),
          ironWood: Boolean(race["iron_wood"]),
        });
      },
    });
    getResources().Containers.cost["Steel"] = 125;

    JobManager.craftingJobs = Object.values(crafter);

    // Construct city builds list
    // TODO: replace gameMax with queue_complete
    //getBuildings().SacrificialAltar.gameMax = 1; // Although it is technically limited to single altar, we don't care about that, as we're going to click it to make sacrifices
    // Max level depends on achievement progress, building is unavailable during fasting so it doesn't have to update dynamically.
    getBuildings().Banquet.gameMax =
      getGame().global.stats.achieve.endless_hunger?.l ?? 0;
    getBuildings().RedTerraformer.gameMax = 100;
    getBuildings().RedAtmoTerraformer.gameMax = 1;
    getBuildings().RedTerraform.gameMax = 1;
    getBuildings().GasSpaceDock.gameMax = 1;
    getBuildings().DwarfWorldController.gameMax = 1;
    getBuildings().GasSpaceDockShipSegment.gameMax = 100;
    getBuildings().ProximaDyson.gameMax = 100;
    getBuildings().BlackholeStellarEngine.gameMax = 100;
    getBuildings().DwarfWorldCollider.gameMax = 1859;
    getBuildings().DwarfShipyard.gameMax = 1;
    getBuildings().DwarfMassRelay.gameMax = 100;
    getBuildings().DwarfMassRelayComplete.gameMax = 1;
    getBuildings().TitanAI.gameMax = 100;
    getBuildings().TitanAIComplete.gameMax = 1;
    getBuildings().TritonFOB.gameMax = 1;

    getBuildings().SunJumpGate.gameMax = 100;
    getBuildings().TauJumpGate.gameMax = 100;
    getBuildings().TauAlienOutpost.gameMax = 1;
    getBuildings().TauStarRingworld.gameMax = 1000;
    getBuildings().TauStarMatrix.gameMax = 1;
    getBuildings().TauGas2AlienStation.gameMax = 100;
    getBuildings().TauGas2AlienSpaceStation.gameMax = 1;
    getBuildings().TauGas2MatrioshkaBrain.gameMax = 1000;
    getBuildings().TauGas2IgnitionDevice.gameMax = 10;

    getBuildings().ProximaDysonSphere.gameMax = 100;
    getBuildings().ProximaOrichalcumSphere.gameMax = 100;
    getBuildings().ProximaElysaniteSphere.gameMax = 1000;
    getBuildings().BlackholeStargate.gameMax = 200;
    getBuildings().BlackholeStargateComplete.gameMax = 1;
    getBuildings().SiriusSpaceElevator.gameMax = 100;
    getBuildings().SiriusGravityDome.gameMax = 100;
    getBuildings().SiriusAscensionMachine.gameMax = 100;
    getBuildings().SiriusAscensionTrigger.gameMax = 1;
    getBuildings().WastelandThrone.gameMax = 0; // TODO should probably be 1 or 2 with smart logic, 2 to toggle skill assignment mode and 3 to disable it? and then 1 after all skills assigned while a commander is captured
    getBuildings().RuinsWarVault.gameMax = 1;
    getBuildings().BadlandsCodex.gameMax = 0; // TODO script just needs to know what it costs, for now it just tries to spam it
    getBuildings().PitSoulForge.gameMax = 1;
    getBuildings().PitSoulCapacitor.gameMax = 40;
    getBuildings().PitAbsorptionChamber.gameMax = 100;
    getBuildings().GateEastTower.gameMax = 1;
    getBuildings().GateWestTower.gameMax = 1;
    getBuildings().RuinsVault.gameMax = 2;
    getBuildings().LakeOven.gameMax = 100;
    getBuildings().LakeOvenComplete.gameMax = 1;
    getBuildings().SpireBridge.gameMax = 10;
    getBuildings().SpireEdenicGate.gameMax = 1;

    getBuildings().AsphodelMechStation.gameMax = 10;
    getBuildings().AsphodelRuneGate.gameMax = 100;
    getBuildings().ElysiumFireSupportBase.gameMax = 101; // 101th click to fire cannon
    getBuildings().ElysiumNorthPier.gameMax = 10;
    getBuildings().ElysiumRushmore.gameMax = 1;
    getBuildings().ElysiumReincarnation.gameMax = 1; // TODO use it
    getBuildings().IsleSouthPier.gameMax = 10;
    getBuildings().IsleSoulCompactor.gameMax = 1;
    getBuildings().PalaceInfuser.gameMax = 25;
    getBuildings().PalaceConduit.gameMax = 25;
    getBuildings().PalaceTomb.gameMax = 10;

    getBuildings().GorddonEmbassy.gameMax = 1;
    getBuildings().Alien1Consulate.gameMax = 1;

    getProjects().LaunchFacility.gameMax = 1;
    getProjects().ManaSyphon.gameMax = 80;

    getBuildings().CoalPower.addResourceConsumption(
      () =>
        getGame().global.race.universe === "magic"
          ? getResources().Mana
          : getResources().Coal,
      () =>
        getGame().global.race["environmentalist"]
          ? 0
          : getGame().global.race.universe === "magic"
            ? 0.05
            : 0.65,
    );
    getBuildings().OilPower.addResourceConsumption(getResources().Oil, () =>
      getGame().global.race["environmentalist"] ? 0 : 0.65,
    );
    getBuildings().FissionPower.addResourceConsumption(
      getResources().Uranium,
      0.1,
    );
    getBuildings().TouristCenter.addResourceConsumption(
      getResources().Food,
      50,
    );

    // Init support
    getBuildings().SpaceNavBeacon.addSupport(getResources().Moon_Support);
    getBuildings().SpaceNavBeacon.addResourceConsumption(
      getResources().Red_Support,
      () => (haveTech("luna", 3) ? -1 : 0),
    );

    getBuildings().MoonBase.addSupport(getResources().Moon_Support);
    getBuildings().MoonIridiumMine.addSupport(getResources().Moon_Support);
    getBuildings().MoonHeliumMine.addSupport(getResources().Moon_Support);
    getBuildings().MoonObservatory.addSupport(getResources().Moon_Support);

    getBuildings().RedSpaceport.addSupport(getResources().Red_Support);
    getBuildings().RedTower.addSupport(getResources().Red_Support);
    getBuildings().RedLivingQuarters.addSupport(getResources().Red_Support);
    getBuildings().RedVrCenter.addSupport(getResources().Red_Support);
    getBuildings().RedMine.addSupport(getResources().Red_Support);
    getBuildings().RedFabrication.addSupport(getResources().Red_Support);
    getBuildings().RedBiodome.addSupport(getResources().Red_Support);
    getBuildings().RedExoticLab.addSupport(getResources().Red_Support);

    getBuildings().SunSwarmControl.addSupport(getResources().Sun_Support);
    getBuildings().SunSwarmSatellite.addSupport(getResources().Sun_Support);

    getBuildings().BeltSpaceStation.addSupport(getResources().Belt_Support);
    getBuildings().BeltEleriumShip.addSupport(getResources().Belt_Support);
    getBuildings().BeltIridiumShip.addSupport(getResources().Belt_Support);
    getBuildings().BeltIronShip.addSupport(getResources().Belt_Support);

    getBuildings().AlphaStarport.addSupport(getResources().Alpha_Support);
    getBuildings().AlphaHabitat.addSupport(getResources().Alpha_Support);
    getBuildings().AlphaMiningDroid.addSupport(getResources().Alpha_Support);
    getBuildings().AlphaProcessing.addSupport(getResources().Alpha_Support);
    getBuildings().AlphaFusion.addSupport(getResources().Alpha_Support);
    getBuildings().AlphaLaboratory.addSupport(getResources().Alpha_Support);
    getBuildings().AlphaExchange.addSupport(getResources().Alpha_Support);
    getBuildings().AlphaGraphenePlant.addSupport(getResources().Alpha_Support);
    getBuildings().AlphaExoticZoo.addResourceConsumption(
      getResources().Alpha_Support,
      1,
    );
    getBuildings().ProximaTransferStation.addSupport(
      getResources().Alpha_Support,
    );

    getBuildings().NebulaNexus.addSupport(getResources().Nebula_Support);
    getBuildings().NebulaHarvester.addSupport(getResources().Nebula_Support);
    getBuildings().NebulaEleriumProspector.addSupport(
      getResources().Nebula_Support,
    );

    getBuildings().GatewayStarbase.addSupport(getResources().Gateway_Support);
    getBuildings().GatewayShipDock.addSupport(getResources().Gateway_Support);
    getBuildings().BologniumShip.addSupport(getResources().Gateway_Support);
    getBuildings().ScoutShip.addSupport(getResources().Gateway_Support);
    getBuildings().CorvetteShip.addSupport(getResources().Gateway_Support);
    getBuildings().FrigateShip.addSupport(getResources().Gateway_Support);
    getBuildings().CruiserShip.addSupport(getResources().Gateway_Support);
    getBuildings().Dreadnought.addSupport(getResources().Gateway_Support);
    getBuildings().StargateStation.addSupport(getResources().Gateway_Support);
    getBuildings().StargateTelemetryBeacon.addSupport(
      getResources().Gateway_Support,
    );

    getBuildings().Alien2Foothold.addSupport(getResources().Alien_Support);
    getBuildings().Alien2ArmedMiner.addSupport(getResources().Alien_Support);
    getBuildings().Alien2OreProcessor.addSupport(getResources().Alien_Support);
    getBuildings().Alien2Scavenger.addSupport(getResources().Alien_Support);

    getBuildings().LakeHarbor.addSupport(getResources().Lake_Support);
    getBuildings().LakeBireme.addSupport(getResources().Lake_Support);
    getBuildings().LakeTransport.addSupport(getResources().Lake_Support);

    getBuildings().SpirePurifier.addSupport(getResources().Spire_Support);
    getBuildings().SpirePort.addSupport(getResources().Spire_Support);
    getBuildings().SpireBaseCamp.addSupport(getResources().Spire_Support);
    getBuildings().SpireMechBay.addSupport(getResources().Spire_Support);

    getBuildings().TitanElectrolysis.addSupport(getResources().Titan_Support);
    getBuildings().TitanQuarters.addSupport(getResources().Titan_Support);
    getBuildings().TitanMine.addSupport(getResources().Titan_Support);
    getBuildings().TitanGraphene.addSupport(getResources().Titan_Support);
    getBuildings().TitanDecoder.addResourceConsumption(
      getResources().Titan_Support,
      1,
    );

    getBuildings().TitanSpaceport.addSupport(getResources().Enceladus_Support);
    getBuildings().EnceladusWaterFreighter.addSupport(
      getResources().Enceladus_Support,
    );
    getBuildings().EnceladusZeroGLab.addSupport(
      getResources().Enceladus_Support,
    );
    getBuildings().EnceladusBase.addSupport(getResources().Enceladus_Support);

    getBuildings().TitanElectrolysis.addResourceConsumption(
      getResources().Electrolysis_Support,
      -1,
    );
    getBuildings().TitanHydrogen.addResourceConsumption(
      getResources().Electrolysis_Support,
      1,
    );

    getBuildings().ErisDrone.addSupport(getResources().Eris_Support);
    getBuildings().ErisTrooper.addSupport(getResources().Eris_Support);
    getBuildings().ErisTank.addSupport(getResources().Eris_Support);

    getBuildings().TauOrbitalStation.addSupport(getResources().Tau_Support);
    getBuildings().TauFarm.addSupport(getResources().Tau_Support);
    getBuildings().TauColony.addSupport(getResources().Tau_Support);
    getBuildings().TauFactory.addSupport(getResources().Tau_Support);
    getBuildings().TauDiseaseLab.addSupport(getResources().Tau_Support);
    getBuildings().TauMiningPit.addSupport(getResources().Tau_Support);

    getBuildings().TauRedOrbitalPlatform.addSupport(
      getResources().Tau_Red_Support,
    );
    getBuildings().TauRedOverseer.addSupport(getResources().Tau_Red_Support);
    getBuildings().TauRedWomlingVillage.addSupport(
      getResources().Tau_Red_Support,
    );
    getBuildings().TauRedWomlingFarm.addSupport(getResources().Tau_Red_Support);
    getBuildings().TauRedWomlingMine.addSupport(getResources().Tau_Red_Support);
    getBuildings().TauRedWomlingFun.addSupport(getResources().Tau_Red_Support);
    getBuildings().TauRedWomlingLab.addSupport(getResources().Tau_Red_Support);

    getBuildings().TauRedWomlingVillage.addResourceConsumption(
      getResources().Womlings_Support,
      () => (haveTech("womling_pop", 2) ? -6 : -5),
    );
    getBuildings().TauRedWomlingFarm.addResourceConsumption(
      getResources().Womlings_Support,
      () => (getBuildings().TauRedWomlingFarm.autoStateSmart ? 2 : 0),
    );
    getBuildings().TauRedWomlingLab.addResourceConsumption(
      getResources().Womlings_Support,
      () => (getBuildings().TauRedWomlingLab.autoStateSmart ? 1 : 0),
    );
    getBuildings().TauRedWomlingMine.addResourceConsumption(
      getResources().Womlings_Support,
      () => (getBuildings().TauRedWomlingMine.autoStateSmart ? 6 : 0),
    );

    getBuildings().TauBeltPatrolShip.addSupport(
      getResources().Tau_Belt_Support,
    );
    getBuildings().TauBeltMiningShip.addSupport(
      getResources().Tau_Belt_Support,
    );
    getBuildings().TauBeltWhalingShip.addSupport(
      getResources().Tau_Belt_Support,
    );

    getBuildings().AsphodelEncampment.addSupport(
      getResources().Asphodel_Support,
    );
    getBuildings().AsphodelSoulEngine.addSupport(
      getResources().Asphodel_Support,
    );
    getBuildings().AsphodelResearchStation.addSupport(
      getResources().Asphodel_Support,
    );
    getBuildings().AsphodelHarvester.addSupport(
      getResources().Asphodel_Support,
    );
    getBuildings().AsphodelProcessor.addSupport(
      getResources().Asphodel_Support,
    );
    getBuildings().AsphodelBunker.addSupport(getResources().Asphodel_Support);
    getBuildings().AsphodelBlissDen.addSupport(getResources().Asphodel_Support);
    getBuildings().AsphodelRectory.addSupport(getResources().Asphodel_Support);
    getBuildings().AsphodelCorruptor.addSupport(
      getResources().Asphodel_Support,
    );

    // Powered buildings whose output other managed buildings burn as fuel.
    // autoPower reserves power for these so consumers can't starve their own fuel source.
    getBuildings().GasMining.produces = [getResources().Helium_3];
    getBuildings().GasMoonOilExtractor.produces = [getResources().Oil];
    getBuildings().CoalMine.produces = [getResources().Coal];
    getBuildings().NebulaHarvester.produces = [
      getResources().Helium_3,
      getResources().Deuterium,
    ];
    getBuildings().MakemakeElerium.produces = [getResources().Elerium];
    getBuildings().EnceladusWaterFreighter.produces = [getResources().Water];

    // Init consumptions
    getBuildings().MoonBase.addResourceConsumption(getResources().Oil, 2);
    getBuildings().RedSpaceport.addResourceConsumption(
      getResources().Helium_3,
      1.25,
    );
    getBuildings().RedSpaceport.addResourceConsumption(
      getResources().Food,
      () =>
        getGame().global.race["cataclysm"] ||
        getGame().global.race["orbit_decayed"]
          ? 2
          : 25,
    );
    getBuildings().RedFactory.addResourceConsumption(
      getResources().Helium_3,
      1,
    );
    getBuildings().RedSpaceBarracks.addResourceConsumption(
      getResources().Oil,
      2,
    );
    getBuildings().RedSpaceBarracks.addResourceConsumption(
      getResources().Food,
      () =>
        getGame().global.race["cataclysm"] ||
        getGame().global.race["orbit_decayed"]
          ? 0
          : 10,
    );
    getBuildings().HellGeothermal.addResourceConsumption(
      getResources().Helium_3,
      0.5,
    );
    getBuildings().GasMoonOutpost.addResourceConsumption(getResources().Oil, 2);
    getBuildings().BeltSpaceStation.addResourceConsumption(
      getResources().Food,
      () =>
        getGame().global.race["fasting"]
          ? 0
          : getGame().global.race["cataclysm"] ||
              getGame().global.race["orbit_decayed"]
            ? 1
            : 10,
    );
    getBuildings().BeltSpaceStation.addResourceConsumption(
      getResources().Helium_3,
      2.5,
    );
    getBuildings().DwarfEleriumReactor.addResourceConsumption(
      getResources().Elerium,
      0.05,
    );

    getBuildings().AlphaStarport.addResourceConsumption(
      getResources().Food,
      100,
    );
    getBuildings().AlphaStarport.addResourceConsumption(
      getResources().Helium_3,
      5,
    );
    getBuildings().AlphaFusion.addResourceConsumption(
      getResources().Deuterium,
      1.25,
    );
    getBuildings().AlphaExoticZoo.addResourceConsumption(
      getResources().Food,
      12000,
    );
    getBuildings().AlphaMegaFactory.addResourceConsumption(
      getResources().Deuterium,
      5,
    );

    getBuildings().ProximaTransferStation.addResourceConsumption(
      getResources().Uranium,
      0.28,
    );
    getBuildings().ProximaCruiser.addResourceConsumption(
      getResources().Helium_3,
      6,
    );

    getBuildings().NeutronMiner.addResourceConsumption(
      getResources().Helium_3,
      3,
    );

    getBuildings().GatewayStarbase.addResourceConsumption(
      getResources().Helium_3,
      25,
    );
    getBuildings().GatewayStarbase.addResourceConsumption(
      getResources().Food,
      250,
    );

    getBuildings().BologniumShip.addResourceConsumption(
      getResources().Helium_3,
      5,
    );
    getBuildings().ScoutShip.addResourceConsumption(getResources().Helium_3, 6);
    getBuildings().CorvetteShip.addResourceConsumption(
      getResources().Helium_3,
      10,
    );
    getBuildings().FrigateShip.addResourceConsumption(
      getResources().Helium_3,
      25,
    );
    getBuildings().CruiserShip.addResourceConsumption(
      getResources().Deuterium,
      25,
    );
    getBuildings().Dreadnought.addResourceConsumption(
      getResources().Deuterium,
      80,
    );

    getBuildings().GorddonEmbassy.addResourceConsumption(
      getResources().Food,
      () => (getGame().global.race["fasting"] ? 0 : 7500),
    );
    getBuildings().GorddonFreighter.addResourceConsumption(
      getResources().Helium_3,
      12,
    );

    getBuildings().Alien1VitreloyPlant.addResourceConsumption(
      getResources().Bolognium,
      2.5,
    );
    getBuildings().Alien1VitreloyPlant.addResourceConsumption(
      getResources().Stanene,
      100,
    );
    getBuildings().Alien1VitreloyPlant.addResourceConsumption(
      getResources().Money,
      50000,
    );
    getBuildings().Alien1SuperFreighter.addResourceConsumption(
      getResources().Helium_3,
      25,
    );

    getBuildings().Alien2Foothold.addResourceConsumption(
      getResources().Elerium,
      2.5,
    );
    getBuildings().Alien2ArmedMiner.addResourceConsumption(
      getResources().Helium_3,
      10,
    );
    getBuildings().Alien2Scavenger.addResourceConsumption(
      getResources().Helium_3,
      12,
    );

    getBuildings().ChthonianMineLayer.addResourceConsumption(
      getResources().Helium_3,
      8,
    );
    getBuildings().ChthonianRaider.addResourceConsumption(
      getResources().Helium_3,
      18,
    );

    getBuildings().RuinsInfernoPower.addResourceConsumption(
      getResources().Infernite,
      5,
    );
    getBuildings().RuinsInfernoPower.addResourceConsumption(
      getResources().Coal,
      100,
    );
    getBuildings().RuinsInfernoPower.addResourceConsumption(
      getResources().Oil,
      80,
    );

    getBuildings().LakeOvenComplete.addResourceConsumption(
      getResources().Infernite,
      225,
    );

    getBuildings().TitanElectrolysis.addResourceConsumption(
      getResources().Water,
      35,
    );

    getBuildings().TitanQuarters.addResourceConsumption(
      getResources().Water,
      12,
    );
    getBuildings().TitanQuarters.addResourceConsumption(
      getResources().Food,
      500,
    );
    getBuildings().TitanDecoder.addResourceConsumption(
      getResources().Cipher,
      0.06,
    );
    getBuildings().TitanAIComplete.addResourceConsumption(
      getResources().Water,
      1000,
    );

    getBuildings().EnceladusWaterFreighter.addResourceConsumption(
      getResources().Helium_3,
      5,
    );

    getBuildings().TritonFOB.addResourceConsumption(
      getResources().Helium_3,
      125,
    );
    getBuildings().TritonLander.addResourceConsumption(getResources().Oil, 50);

    getBuildings().MakemakeOrichalcum.addResourceConsumption(
      getResources().Oil,
      200,
    );
    getBuildings().MakemakeUranium.addResourceConsumption(
      getResources().Oil,
      60,
    );
    getBuildings().MakemakeNeutronium.addResourceConsumption(
      getResources().Oil,
      60,
    );
    getBuildings().MakemakeElerium.addResourceConsumption(
      getResources().Oil,
      125,
    );

    getBuildings().ErisDrone.addResourceConsumption(getResources().Uranium, 5);

    getBuildings().TauOrbitalStation.addResourceConsumption(
      getResources().Helium_3,
      () =>
        haveTech("isolation")
          ? getGame().global.race["lone_survivor"]
            ? 5
            : 25
          : 400,
    );
    getBuildings().TauColony.addResourceConsumption(getResources().Food, () =>
      haveTech("isolation")
        ? getGame().global.race["lone_survivor"]
          ? -2
          : 75
        : 1000,
    );
    getBuildings().TauFusionGenerator.addResourceConsumption(
      getResources().Helium_3,
      () =>
        haveTech("isolation")
          ? getGame().global.race["lone_survivor"]
            ? -15
            : 75
          : 500,
    );
    getBuildings().TauCulturalCenter.addResourceConsumption(
      getResources().Food,
      () => (getGame().global.race["lone_survivor"] ? 25 : 500),
    );
    getBuildings().TauRedOrbitalPlatform.addResourceConsumption(
      getResources().Oil,
      () =>
        getGame().global.race["lone_survivor"]
          ? 0
          : haveTech("isolation")
            ? 32
            : 125,
    );
    getBuildings().TauRedOrbitalPlatform.addResourceConsumption(
      getResources().Helium_3,
      () =>
        getGame().global.race["lone_survivor"]
          ? haveTech("isolation")
            ? 8
            : 125
          : 0,
    );
    getBuildings().TauBeltPatrolShip.addResourceConsumption(
      getResources().Helium_3,
      () => (haveTech("isolation") ? 15 : 250),
    );
    getBuildings().TauBeltMiningShip.addResourceConsumption(
      getResources().Helium_3,
      () => (haveTech("isolation") ? 12 : 75),
    );
    getBuildings().TauBeltWhalingShip.addResourceConsumption(
      getResources().Helium_3,
      () => (haveTech("isolation") ? 14 : 90),
    );
    getBuildings().TauGas2AlienSpaceStation.addResourceConsumption(
      getResources().Elerium,
      () => (getGame().global.race["lone_survivor"] ? 1 : 10),
    );

    // Better back compatibility, to run beta version's script on stable game build without commenting out new buildings
    setBuildings(
      Object.fromEntries(
        Object.entries(getBuildings()).filter(([, b]) =>
          b.definition ? true : log(`${b.name} action not found.`),
        ),
      ),
    );

    // These are buildings which are specified as powered in the actions definition game code but aren't actually powered in the main.js powered calculations
    Object.values(getBuildings()).forEach((building) => {
      if (building.powered > 0) {
        let powerId = (building._location || building._tab) + ":" + building.id;
        if (getGame().global.power.indexOf(powerId) === -1) {
          building.overridePowered = 0;
        }
      }
    });
    //Object.defineProperty(getBuildings().Assembly, "overridePowered", {get: () => traitVal('powered', 0)});
    //Object.defineProperty(getBuildings().RedAssembly, "overridePowered", {get: () => traitVal('powered', 0)});
    getBuildings().Windmill.overridePowered = -1;
    getBuildings().SunSwarmSatellite.overridePowered = -0.35;
    getBuildings().ProximaDyson.overridePowered = -1.25;
    getBuildings().ProximaDysonSphere.overridePowered = -5;
    getBuildings().ProximaOrichalcumSphere.overridePowered = -8;
    getBuildings().ProximaElysaniteSphere.overridePowered = -18;
    getBuildings().BlackholeStellarEngine.overridePowered = 0;
    getBuildings().WastelandIncinerator.overridePowered = -25;
    // Numbers aren't exactly correct. That's fine - it won't mess with calculations - it's not something we can turn off and on. We just need to know that they *are* power generators, for autobuild, and that's enough for us.
    // We don't handle the Stellar Engine at at all, it will be treated as mystery power in autoPower
  }

  return { initialiseState };
}
