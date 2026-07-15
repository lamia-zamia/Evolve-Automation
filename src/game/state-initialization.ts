type LooseFunction = (...args: any[]) => any;
type LooseObject = Record<PropertyKey, any>;

type StateInitializationDependencies = {
  getGame: () => LooseObject;
  getResources: () => LooseObject;
  getJobManager: () => LooseObject;
  getCrafter: () => LooseObject;
  getBuildings: () => LooseObject;
  setBuildings: (buildings: LooseObject) => void;
  getProjects: () => LooseObject;
  getUpdateCraftCost: () => LooseFunction;
  getUpdateTabs: () => LooseFunction;
  getIsLumberRace: () => LooseFunction;
  getHaveTech: () => LooseFunction;
  log: (message: string) => void;
};

function liveObject(getValue: () => LooseObject): LooseObject {
  return new Proxy({} as LooseObject, {
    get: (_target, property) => Reflect.get(getValue(), property),
    set: (_target, property, value) => Reflect.set(getValue(), property, value),
    has: (_target, property) => Reflect.has(getValue(), property),
    ownKeys: () => Reflect.ownKeys(getValue()),
    getOwnPropertyDescriptor: (_target, property) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(getValue(), property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
    defineProperty: (_target, property, attributes) =>
      Reflect.defineProperty(getValue(), property, attributes),
  });
}

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
  getIsLumberRace,
  getHaveTech,
  log,
}: StateInitializationDependencies) {
  const game = liveObject(getGame);
  const resources = liveObject(getResources);
  const buildings = liveObject(getBuildings);
  const projects = liveObject(getProjects);
  const updateCraftCost: LooseFunction = (...args) =>
    getUpdateCraftCost()(...args);
  const updateTabs: LooseFunction = (...args) => getUpdateTabs()(...args);
  const isLumberRace: LooseFunction = (...args) => getIsLumberRace()(...args);
  const haveTech: LooseFunction = (...args) => getHaveTech()(...args);

  function initialiseState() {
    const JobManager = getJobManager();
    const crafter = getCrafter();

    updateCraftCost();
    updateTabs(false);

    // Lets set our crate / container resource requirements
    Object.defineProperty(resources.Crates, "cost", {
      get: () =>
        game.global.race["warlord"] && game.global.race["iron_wood"]
          ? { Lumber: 200 }
          : isLumberRace()
            ? { Plywood: 10 }
            : { Stone: 200 },
    });
    resources.Containers.cost["Steel"] = 125;

    JobManager.craftingJobs = Object.values(crafter);

    // Construct city builds list
    // TODO: replace gameMax with queue_complete
    //buildings.SacrificialAltar.gameMax = 1; // Although it is technically limited to single altar, we don't care about that, as we're going to click it to make sacrifices
    // Max level depends on achievement progress, building is unavailable during fasting so it doesn't have to update dynamically.
    buildings.Banquet.gameMax =
      game.global.stats.achieve.endless_hunger?.l ?? 0;
    buildings.RedTerraformer.gameMax = 100;
    buildings.RedAtmoTerraformer.gameMax = 1;
    buildings.RedTerraform.gameMax = 1;
    buildings.GasSpaceDock.gameMax = 1;
    buildings.DwarfWorldController.gameMax = 1;
    buildings.GasSpaceDockShipSegment.gameMax = 100;
    buildings.ProximaDyson.gameMax = 100;
    buildings.BlackholeStellarEngine.gameMax = 100;
    buildings.DwarfWorldCollider.gameMax = 1859;
    buildings.DwarfShipyard.gameMax = 1;
    buildings.DwarfMassRelay.gameMax = 100;
    buildings.DwarfMassRelayComplete.gameMax = 1;
    buildings.TitanAI.gameMax = 100;
    buildings.TitanAIComplete.gameMax = 1;
    buildings.TritonFOB.gameMax = 1;

    buildings.SunJumpGate.gameMax = 100;
    buildings.TauJumpGate.gameMax = 100;
    buildings.TauAlienOutpost.gameMax = 1;
    buildings.TauStarRingworld.gameMax = 1000;
    buildings.TauStarMatrix.gameMax = 1;
    buildings.TauGas2AlienStation.gameMax = 100;
    buildings.TauGas2AlienSpaceStation.gameMax = 1;
    buildings.TauGas2MatrioshkaBrain.gameMax = 1000;
    buildings.TauGas2IgnitionDevice.gameMax = 10;

    buildings.ProximaDysonSphere.gameMax = 100;
    buildings.ProximaOrichalcumSphere.gameMax = 100;
    buildings.ProximaElysaniteSphere.gameMax = 1000;
    buildings.BlackholeStargate.gameMax = 200;
    buildings.BlackholeStargateComplete.gameMax = 1;
    buildings.SiriusSpaceElevator.gameMax = 100;
    buildings.SiriusGravityDome.gameMax = 100;
    buildings.SiriusAscensionMachine.gameMax = 100;
    buildings.SiriusAscensionTrigger.gameMax = 1;
    buildings.WastelandThrone.gameMax = 0; // TODO should probably be 1 or 2 with smart logic, 2 to toggle skill assignment mode and 3 to disable it? and then 1 after all skills assigned while a commander is captured
    buildings.RuinsWarVault.gameMax = 1;
    buildings.BadlandsCodex.gameMax = 0; // TODO script just needs to know what it costs, for now it just tries to spam it
    buildings.PitSoulForge.gameMax = 1;
    buildings.PitSoulCapacitor.gameMax = 40;
    buildings.PitAbsorptionChamber.gameMax = 100;
    buildings.GateEastTower.gameMax = 1;
    buildings.GateWestTower.gameMax = 1;
    buildings.RuinsVault.gameMax = 2;
    buildings.LakeOven.gameMax = 100;
    buildings.LakeOvenComplete.gameMax = 1;
    buildings.SpireBridge.gameMax = 10;
    buildings.SpireEdenicGate.gameMax = 1;

    buildings.AsphodelMechStation.gameMax = 10;
    buildings.AsphodelRuneGate.gameMax = 100;
    buildings.ElysiumFireSupportBase.gameMax = 101; // 101th click to fire cannon
    buildings.ElysiumNorthPier.gameMax = 10;
    buildings.ElysiumRushmore.gameMax = 1;
    buildings.ElysiumReincarnation.gameMax = 1; // TODO use it
    buildings.IsleSouthPier.gameMax = 10;
    buildings.IsleSoulCompactor.gameMax = 1;
    buildings.PalaceInfuser.gameMax = 25;
    buildings.PalaceConduit.gameMax = 25;
    buildings.PalaceTomb.gameMax = 10;

    buildings.GorddonEmbassy.gameMax = 1;
    buildings.Alien1Consulate.gameMax = 1;

    projects.LaunchFacility.gameMax = 1;
    projects.ManaSyphon.gameMax = 80;

    buildings.CoalPower.addResourceConsumption(
      () =>
        game.global.race.universe === "magic" ? resources.Mana : resources.Coal,
      () =>
        game.global.race["environmentalist"]
          ? 0
          : game.global.race.universe === "magic"
            ? 0.05
            : 0.65,
    );
    buildings.OilPower.addResourceConsumption(resources.Oil, () =>
      game.global.race["environmentalist"] ? 0 : 0.65,
    );
    buildings.FissionPower.addResourceConsumption(resources.Uranium, 0.1);
    buildings.TouristCenter.addResourceConsumption(resources.Food, 50);

    // Init support
    buildings.SpaceNavBeacon.addSupport(resources.Moon_Support);
    buildings.SpaceNavBeacon.addResourceConsumption(
      resources.Red_Support,
      () => (haveTech("luna", 3) ? -1 : 0),
    );

    buildings.MoonBase.addSupport(resources.Moon_Support);
    buildings.MoonIridiumMine.addSupport(resources.Moon_Support);
    buildings.MoonHeliumMine.addSupport(resources.Moon_Support);
    buildings.MoonObservatory.addSupport(resources.Moon_Support);

    buildings.RedSpaceport.addSupport(resources.Red_Support);
    buildings.RedTower.addSupport(resources.Red_Support);
    buildings.RedLivingQuarters.addSupport(resources.Red_Support);
    buildings.RedVrCenter.addSupport(resources.Red_Support);
    buildings.RedMine.addSupport(resources.Red_Support);
    buildings.RedFabrication.addSupport(resources.Red_Support);
    buildings.RedBiodome.addSupport(resources.Red_Support);
    buildings.RedExoticLab.addSupport(resources.Red_Support);

    buildings.SunSwarmControl.addSupport(resources.Sun_Support);
    buildings.SunSwarmSatellite.addSupport(resources.Sun_Support);

    buildings.BeltSpaceStation.addSupport(resources.Belt_Support);
    buildings.BeltEleriumShip.addSupport(resources.Belt_Support);
    buildings.BeltIridiumShip.addSupport(resources.Belt_Support);
    buildings.BeltIronShip.addSupport(resources.Belt_Support);

    buildings.AlphaStarport.addSupport(resources.Alpha_Support);
    buildings.AlphaHabitat.addSupport(resources.Alpha_Support);
    buildings.AlphaMiningDroid.addSupport(resources.Alpha_Support);
    buildings.AlphaProcessing.addSupport(resources.Alpha_Support);
    buildings.AlphaFusion.addSupport(resources.Alpha_Support);
    buildings.AlphaLaboratory.addSupport(resources.Alpha_Support);
    buildings.AlphaExchange.addSupport(resources.Alpha_Support);
    buildings.AlphaGraphenePlant.addSupport(resources.Alpha_Support);
    buildings.AlphaExoticZoo.addResourceConsumption(resources.Alpha_Support, 1);
    buildings.ProximaTransferStation.addSupport(resources.Alpha_Support);

    buildings.NebulaNexus.addSupport(resources.Nebula_Support);
    buildings.NebulaHarvester.addSupport(resources.Nebula_Support);
    buildings.NebulaEleriumProspector.addSupport(resources.Nebula_Support);

    buildings.GatewayStarbase.addSupport(resources.Gateway_Support);
    buildings.GatewayShipDock.addSupport(resources.Gateway_Support);
    buildings.BologniumShip.addSupport(resources.Gateway_Support);
    buildings.ScoutShip.addSupport(resources.Gateway_Support);
    buildings.CorvetteShip.addSupport(resources.Gateway_Support);
    buildings.FrigateShip.addSupport(resources.Gateway_Support);
    buildings.CruiserShip.addSupport(resources.Gateway_Support);
    buildings.Dreadnought.addSupport(resources.Gateway_Support);
    buildings.StargateStation.addSupport(resources.Gateway_Support);
    buildings.StargateTelemetryBeacon.addSupport(resources.Gateway_Support);

    buildings.Alien2Foothold.addSupport(resources.Alien_Support);
    buildings.Alien2ArmedMiner.addSupport(resources.Alien_Support);
    buildings.Alien2OreProcessor.addSupport(resources.Alien_Support);
    buildings.Alien2Scavenger.addSupport(resources.Alien_Support);

    buildings.LakeHarbor.addSupport(resources.Lake_Support);
    buildings.LakeBireme.addSupport(resources.Lake_Support);
    buildings.LakeTransport.addSupport(resources.Lake_Support);

    buildings.SpirePurifier.addSupport(resources.Spire_Support);
    buildings.SpirePort.addSupport(resources.Spire_Support);
    buildings.SpireBaseCamp.addSupport(resources.Spire_Support);
    buildings.SpireMechBay.addSupport(resources.Spire_Support);

    buildings.TitanElectrolysis.addSupport(resources.Titan_Support);
    buildings.TitanQuarters.addSupport(resources.Titan_Support);
    buildings.TitanMine.addSupport(resources.Titan_Support);
    buildings.TitanGraphene.addSupport(resources.Titan_Support);
    buildings.TitanDecoder.addResourceConsumption(resources.Titan_Support, 1);

    buildings.TitanSpaceport.addSupport(resources.Enceladus_Support);
    buildings.EnceladusWaterFreighter.addSupport(resources.Enceladus_Support);
    buildings.EnceladusZeroGLab.addSupport(resources.Enceladus_Support);
    buildings.EnceladusBase.addSupport(resources.Enceladus_Support);

    buildings.TitanElectrolysis.addResourceConsumption(
      resources.Electrolysis_Support,
      -1,
    );
    buildings.TitanHydrogen.addResourceConsumption(
      resources.Electrolysis_Support,
      1,
    );

    buildings.ErisDrone.addSupport(resources.Eris_Support);
    buildings.ErisTrooper.addSupport(resources.Eris_Support);
    buildings.ErisTank.addSupport(resources.Eris_Support);

    buildings.TauOrbitalStation.addSupport(resources.Tau_Support);
    buildings.TauFarm.addSupport(resources.Tau_Support);
    buildings.TauColony.addSupport(resources.Tau_Support);
    buildings.TauFactory.addSupport(resources.Tau_Support);
    buildings.TauDiseaseLab.addSupport(resources.Tau_Support);
    buildings.TauMiningPit.addSupport(resources.Tau_Support);

    buildings.TauRedOrbitalPlatform.addSupport(resources.Tau_Red_Support);
    buildings.TauRedOverseer.addSupport(resources.Tau_Red_Support);
    buildings.TauRedWomlingVillage.addSupport(resources.Tau_Red_Support);
    buildings.TauRedWomlingFarm.addSupport(resources.Tau_Red_Support);
    buildings.TauRedWomlingMine.addSupport(resources.Tau_Red_Support);
    buildings.TauRedWomlingFun.addSupport(resources.Tau_Red_Support);
    buildings.TauRedWomlingLab.addSupport(resources.Tau_Red_Support);

    buildings.TauRedWomlingVillage.addResourceConsumption(
      resources.Womlings_Support,
      () => (haveTech("womling_pop", 2) ? -6 : -5),
    );
    buildings.TauRedWomlingFarm.addResourceConsumption(
      resources.Womlings_Support,
      () => (buildings.TauRedWomlingFarm.autoStateSmart ? 2 : 0),
    );
    buildings.TauRedWomlingLab.addResourceConsumption(
      resources.Womlings_Support,
      () => (buildings.TauRedWomlingLab.autoStateSmart ? 1 : 0),
    );
    buildings.TauRedWomlingMine.addResourceConsumption(
      resources.Womlings_Support,
      () => (buildings.TauRedWomlingMine.autoStateSmart ? 6 : 0),
    );

    buildings.TauBeltPatrolShip.addSupport(resources.Tau_Belt_Support);
    buildings.TauBeltMiningShip.addSupport(resources.Tau_Belt_Support);
    buildings.TauBeltWhalingShip.addSupport(resources.Tau_Belt_Support);

    buildings.AsphodelEncampment.addSupport(resources.Asphodel_Support);
    buildings.AsphodelSoulEngine.addSupport(resources.Asphodel_Support);
    buildings.AsphodelResearchStation.addSupport(resources.Asphodel_Support);
    buildings.AsphodelHarvester.addSupport(resources.Asphodel_Support);
    buildings.AsphodelProcessor.addSupport(resources.Asphodel_Support);
    buildings.AsphodelBunker.addSupport(resources.Asphodel_Support);
    buildings.AsphodelBlissDen.addSupport(resources.Asphodel_Support);
    buildings.AsphodelRectory.addSupport(resources.Asphodel_Support);
    buildings.AsphodelCorruptor.addSupport(resources.Asphodel_Support);

    // Powered buildings whose output other managed buildings burn as fuel.
    // autoPower reserves power for these so consumers can't starve their own fuel source.
    buildings.GasMining.produces = [resources.Helium_3];
    buildings.GasMoonOilExtractor.produces = [resources.Oil];
    buildings.CoalMine.produces = [resources.Coal];
    buildings.NebulaHarvester.produces = [
      resources.Helium_3,
      resources.Deuterium,
    ];
    buildings.KuiperElerium.produces = [resources.Elerium];
    buildings.EnceladusWaterFreighter.produces = [resources.Water];

    // Init consumptions
    buildings.MoonBase.addResourceConsumption(resources.Oil, 2);
    buildings.RedSpaceport.addResourceConsumption(resources.Helium_3, 1.25);
    buildings.RedSpaceport.addResourceConsumption(resources.Food, () =>
      game.global.race["cataclysm"] || game.global.race["orbit_decayed"]
        ? 2
        : 25,
    );
    buildings.RedFactory.addResourceConsumption(resources.Helium_3, 1);
    buildings.RedSpaceBarracks.addResourceConsumption(resources.Oil, 2);
    buildings.RedSpaceBarracks.addResourceConsumption(resources.Food, () =>
      game.global.race["cataclysm"] || game.global.race["orbit_decayed"]
        ? 0
        : 10,
    );
    buildings.HellGeothermal.addResourceConsumption(resources.Helium_3, 0.5);
    buildings.GasMoonOutpost.addResourceConsumption(resources.Oil, 2);
    buildings.BeltSpaceStation.addResourceConsumption(resources.Food, () =>
      game.global.race["fasting"]
        ? 0
        : game.global.race["cataclysm"] || game.global.race["orbit_decayed"]
          ? 1
          : 10,
    );
    buildings.BeltSpaceStation.addResourceConsumption(resources.Helium_3, 2.5);
    buildings.DwarfEleriumReactor.addResourceConsumption(
      resources.Elerium,
      0.05,
    );

    buildings.AlphaStarport.addResourceConsumption(resources.Food, 100);
    buildings.AlphaStarport.addResourceConsumption(resources.Helium_3, 5);
    buildings.AlphaFusion.addResourceConsumption(resources.Deuterium, 1.25);
    buildings.AlphaExoticZoo.addResourceConsumption(resources.Food, 12000);
    buildings.AlphaMegaFactory.addResourceConsumption(resources.Deuterium, 5);

    buildings.ProximaTransferStation.addResourceConsumption(
      resources.Uranium,
      0.28,
    );
    buildings.ProximaCruiser.addResourceConsumption(resources.Helium_3, 6);

    buildings.NeutronMiner.addResourceConsumption(resources.Helium_3, 3);

    buildings.GatewayStarbase.addResourceConsumption(resources.Helium_3, 25);
    buildings.GatewayStarbase.addResourceConsumption(resources.Food, 250);

    buildings.BologniumShip.addResourceConsumption(resources.Helium_3, 5);
    buildings.ScoutShip.addResourceConsumption(resources.Helium_3, 6);
    buildings.CorvetteShip.addResourceConsumption(resources.Helium_3, 10);
    buildings.FrigateShip.addResourceConsumption(resources.Helium_3, 25);
    buildings.CruiserShip.addResourceConsumption(resources.Deuterium, 25);
    buildings.Dreadnought.addResourceConsumption(resources.Deuterium, 80);

    buildings.GorddonEmbassy.addResourceConsumption(resources.Food, () =>
      game.global.race["fasting"] ? 0 : 7500,
    );
    buildings.GorddonFreighter.addResourceConsumption(resources.Helium_3, 12);

    buildings.Alien1VitreloyPlant.addResourceConsumption(
      resources.Bolognium,
      2.5,
    );
    buildings.Alien1VitreloyPlant.addResourceConsumption(
      resources.Stanene,
      100,
    );
    buildings.Alien1VitreloyPlant.addResourceConsumption(
      resources.Money,
      50000,
    );
    buildings.Alien1SuperFreighter.addResourceConsumption(
      resources.Helium_3,
      25,
    );

    buildings.Alien2Foothold.addResourceConsumption(resources.Elerium, 2.5);
    buildings.Alien2ArmedMiner.addResourceConsumption(resources.Helium_3, 10);
    buildings.Alien2Scavenger.addResourceConsumption(resources.Helium_3, 12);

    buildings.ChthonianMineLayer.addResourceConsumption(resources.Helium_3, 8);
    buildings.ChthonianRaider.addResourceConsumption(resources.Helium_3, 18);

    buildings.RuinsInfernoPower.addResourceConsumption(resources.Infernite, 5);
    buildings.RuinsInfernoPower.addResourceConsumption(resources.Coal, 100);
    buildings.RuinsInfernoPower.addResourceConsumption(resources.Oil, 80);

    buildings.LakeOvenComplete.addResourceConsumption(resources.Infernite, 225);

    buildings.TitanElectrolysis.addResourceConsumption(resources.Water, 35);

    buildings.TitanQuarters.addResourceConsumption(resources.Water, 12);
    buildings.TitanQuarters.addResourceConsumption(resources.Food, 500);
    buildings.TitanDecoder.addResourceConsumption(resources.Cipher, 0.06);
    buildings.TitanAIComplete.addResourceConsumption(resources.Water, 1000);

    buildings.EnceladusWaterFreighter.addResourceConsumption(
      resources.Helium_3,
      5,
    );

    buildings.TritonFOB.addResourceConsumption(resources.Helium_3, 125);
    buildings.TritonLander.addResourceConsumption(resources.Oil, 50);

    buildings.KuiperOrichalcum.addResourceConsumption(resources.Oil, 200);
    buildings.KuiperUranium.addResourceConsumption(resources.Oil, 60);
    buildings.KuiperNeutronium.addResourceConsumption(resources.Oil, 60);
    buildings.KuiperElerium.addResourceConsumption(resources.Oil, 125);

    buildings.ErisDrone.addResourceConsumption(resources.Uranium, 5);

    buildings.TauOrbitalStation.addResourceConsumption(
      resources.Helium_3,
      () =>
        haveTech("isolation")
          ? game.global.race["lone_survivor"]
            ? 5
            : 25
          : 400,
    );
    buildings.TauColony.addResourceConsumption(resources.Food, () =>
      haveTech("isolation")
        ? game.global.race["lone_survivor"]
          ? -2
          : 75
        : 1000,
    );
    buildings.TauFusionGenerator.addResourceConsumption(
      resources.Helium_3,
      () =>
        haveTech("isolation")
          ? game.global.race["lone_survivor"]
            ? -15
            : 75
          : 500,
    );
    buildings.TauCulturalCenter.addResourceConsumption(resources.Food, () =>
      game.global.race["lone_survivor"] ? 25 : 500,
    );
    buildings.TauRedOrbitalPlatform.addResourceConsumption(resources.Oil, () =>
      game.global.race["lone_survivor"] ? 0 : haveTech("isolation") ? 32 : 125,
    );
    buildings.TauRedOrbitalPlatform.addResourceConsumption(
      resources.Helium_3,
      () =>
        game.global.race["lone_survivor"]
          ? haveTech("isolation")
            ? 8
            : 125
          : 0,
    );
    buildings.TauBeltPatrolShip.addResourceConsumption(
      resources.Helium_3,
      () => (haveTech("isolation") ? 15 : 250),
    );
    buildings.TauBeltMiningShip.addResourceConsumption(
      resources.Helium_3,
      () => (haveTech("isolation") ? 12 : 75),
    );
    buildings.TauBeltWhalingShip.addResourceConsumption(
      resources.Helium_3,
      () => (haveTech("isolation") ? 14 : 90),
    );
    buildings.TauGas2AlienSpaceStation.addResourceConsumption(
      resources.Elerium,
      () => (game.global.race["lone_survivor"] ? 1 : 10),
    );

    // Better back compatibility, to run beta version's script on stable game build without commenting out new buildings
    setBuildings(
      Object.fromEntries(
        Object.entries(buildings).filter(([id, b]) =>
          b.definition ? true : log(`${b.name} action not found.`),
        ),
      ),
    );

    // These are buildings which are specified as powered in the actions definition game code but aren't actually powered in the main.js powered calculations
    Object.values(buildings).forEach((building) => {
      if (building.powered > 0) {
        let powerId = (building._location || building._tab) + ":" + building.id;
        if (game.global.power.indexOf(powerId) === -1) {
          building.overridePowered = 0;
        }
      }
    });
    //Object.defineProperty(buildings.Assembly, "overridePowered", {get: () => traitVal('powered', 0)});
    //Object.defineProperty(buildings.RedAssembly, "overridePowered", {get: () => traitVal('powered', 0)});
    buildings.Windmill.overridePowered = -1;
    buildings.SunSwarmSatellite.overridePowered = -0.35;
    buildings.ProximaDyson.overridePowered = -1.25;
    buildings.ProximaDysonSphere.overridePowered = -5;
    buildings.ProximaOrichalcumSphere.overridePowered = -8;
    buildings.ProximaElysaniteSphere.overridePowered = -18;
    buildings.BlackholeStellarEngine.overridePowered = 0;
    buildings.WastelandIncinerator.overridePowered = -25;
    // Numbers aren't exactly correct. That's fine - it won't mess with calculations - it's not something we can turn off and on. We just need to know that they *are* power generators, for autobuild, and that's enough for us.
    // We don't handle the Stellar Engine at at all, it will be treated as mystery power in autoPower
  }

  return { initialiseState };
}
