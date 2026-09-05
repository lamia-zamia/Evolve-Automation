/** A building in the priority list. Only its switchability is read here. */
type BuildingEntity = { isSwitchable(): boolean };

type BuildingManagerShape = {
  priorityList: BuildingEntity[];
  statePriorityList: BuildingEntity[];
};

type BuildingStateInitializationDependencies = {
  // Not every id in the list below exists in every game version, and a missing
  // one is dropped from the built lists rather than treated as an error.
  getBuildings: () => Record<string, BuildingEntity | undefined>;
  getBuildingManager: () => BuildingManagerShape;
};

export function createBuildingStateInitialization({
  getBuildings,
  getBuildingManager,
}: BuildingStateInitializationDependencies) {
  function initBuildingState() {
    const buildings = getBuildings();
    const BuildingManager = getBuildingManager();

    let priorityList: (BuildingEntity | undefined)[] = [];

    priorityList.push(buildings.Windmill);
    priorityList.push(buildings.Mill);
    priorityList.push(buildings.CoalPower);
    priorityList.push(buildings.OilPower);
    priorityList.push(buildings.FissionPower);
    priorityList.push(buildings.TauFusionGenerator);
    priorityList.push(buildings.TauGas2AlienSpaceStation);

    priorityList.push(buildings.WastelandIncinerator);

    priorityList.push(buildings.RuinsHellForge);
    priorityList.push(buildings.RuinsInfernoPower);

    priorityList.push(buildings.AsphodelEncampment);
    priorityList.push(buildings.AsphodelRectory);
    priorityList.push(buildings.AsphodelCorruptor);
    priorityList.push(buildings.AsphodelSoulEngine);

    priorityList.push(buildings.TitanElectrolysis);
    priorityList.push(buildings.TitanHydrogen);
    priorityList.push(buildings.TitanQuarters);

    priorityList.push(buildings.DwarfMassRelayComplete);
    priorityList.push(buildings.RuinsArcology);
    priorityList.push(buildings.Apartment);
    priorityList.push(buildings.Barracks);
    priorityList.push(buildings.TouristCenter);
    priorityList.push(buildings.University);
    priorityList.push(buildings.Smelter);
    priorityList.push(buildings.Temple);
    priorityList.push(buildings.OilWell);
    priorityList.push(buildings.StorageYard);
    priorityList.push(buildings.Warehouse);
    priorityList.push(buildings.Bank);
    priorityList.push(buildings.Hospital);
    priorityList.push(buildings.BootCamp);
    priorityList.push(buildings.House);
    priorityList.push(buildings.Cottage);
    priorityList.push(buildings.Farm);
    priorityList.push(buildings.Silo);
    priorityList.push(buildings.Shed);
    priorityList.push(buildings.LumberYard);
    priorityList.push(buildings.Foundry);
    priorityList.push(buildings.OilDepot);
    priorityList.push(buildings.Trade);
    priorityList.push(buildings.Amphitheatre);
    priorityList.push(buildings.Library);
    priorityList.push(buildings.Wharf);
    priorityList.push(buildings.NaniteFactory); // Deconstructor trait
    priorityList.push(buildings.RedNaniteFactory); // Deconstructor trait & Cataclysm only
    priorityList.push(buildings.TauNaniteFactory); // Deconstructor trait & True Path only
    priorityList.push(buildings.Transmitter); // Artifical trait
    priorityList.push(buildings.Assembly); // Artifical trait
    priorityList.push(buildings.RedAssembly); // Artifical trait & Cataclysm only
    priorityList.push(buildings.TauAssembly); // Artifical trait & True Path only
    priorityList.push(buildings.TauCloning); // Sterile assembly
    priorityList.push(buildings.Lodge); // Carnivore/Detritivore/Soul Eater trait
    priorityList.push(buildings.Smokehouse); // Carnivore trait
    priorityList.push(buildings.SoulWell); // Soul Eater trait
    priorityList.push(buildings.SlavePen); // Slaver trait
    priorityList.push(buildings.SlaveMarket); // Slaver trait
    priorityList.push(buildings.CaptiveHousing); // Unfathomable trait
    priorityList.push(buildings.RedCaptiveHousing); // Unfathomable trait
    priorityList.push(buildings.TauCaptiveHousing); // Unfathomable trait
    priorityList.push(buildings.Graveyard); // Evil trait
    priorityList.push(buildings.Shrine); // Magnificent trait
    priorityList.push(buildings.CompostHeap); // Detritivore trait
    priorityList.push(buildings.ConcealWard); // Witch Hunting only
    priorityList.push(buildings.Pylon); // Magic Universe only
    priorityList.push(buildings.RedPylon); // Magic Universe & Cataclysm only
    priorityList.push(buildings.TauPylon); // Magic Universe & True Path only
    priorityList.push(buildings.ForgeHorseshoe); // Hooved trait
    priorityList.push(buildings.RedForgeHorseshoe); // Hooved trait
    priorityList.push(buildings.TauForgeHorseshoe); // Hooved trait
    priorityList.push(buildings.SacrificialAltar); // Cannibalize trait
    priorityList.push(buildings.MeditationChamber); // Calm trait
    priorityList.push(buildings.Banquet); // Fasting reward

    priorityList.push(buildings.DwarfMission);
    priorityList.push(buildings.DwarfEleriumReactor);
    priorityList.push(buildings.DwarfWorldCollider);

    priorityList.push(buildings.HellMission);
    priorityList.push(buildings.HellGeothermal);
    priorityList.push(buildings.HellSwarmPlant);

    priorityList.push(buildings.ProximaTransferStation);
    priorityList.push(buildings.ProximaMission);
    priorityList.push(buildings.ProximaCargoYard);
    priorityList.push(buildings.ProximaCruiser);
    priorityList.push(buildings.ProximaDyson);
    priorityList.push(buildings.ProximaDysonSphere);
    priorityList.push(buildings.ProximaOrichalcumSphere);
    priorityList.push(buildings.ProximaElysaniteSphere);

    priorityList.push(buildings.AlphaMission);
    priorityList.push(buildings.AlphaStarport);
    priorityList.push(buildings.AlphaHabitat);
    priorityList.push(buildings.AlphaFusion);
    priorityList.push(buildings.AlphaLuxuryCondo);
    priorityList.push(buildings.AlphaMiningDroid);
    priorityList.push(buildings.AlphaProcessing);
    priorityList.push(buildings.AlphaLaboratory);
    priorityList.push(buildings.AlphaExoticZoo);
    priorityList.push(buildings.AlphaExchange);
    priorityList.push(buildings.AlphaGraphenePlant);
    priorityList.push(buildings.AlphaWarehouse);

    priorityList.push(buildings.SpaceTestLaunch);
    priorityList.push(buildings.SpaceSatellite);
    priorityList.push(buildings.SpaceGps);
    priorityList.push(buildings.SpacePropellantDepot);
    priorityList.push(buildings.SpaceNavBeacon);

    priorityList.push(buildings.RedMission);
    priorityList.push(buildings.RedTower);
    priorityList.push(buildings.RedSpaceport);
    priorityList.push(buildings.RedLivingQuarters);
    priorityList.push(buildings.RedBiodome);
    priorityList.push(buildings.RedSpaceBarracks);
    priorityList.push(buildings.RedExoticLab);
    priorityList.push(buildings.RedFabrication);
    priorityList.push(buildings.RedMine);
    priorityList.push(buildings.RedVrCenter);
    priorityList.push(buildings.RedZiggurat);
    priorityList.push(buildings.RedGarage);
    priorityList.push(buildings.RedUniversity);
    priorityList.push(buildings.RedTerraformer);
    //priorityList.push(buildings.RedTerraform);

    priorityList.push(buildings.MoonMission);
    priorityList.push(buildings.MoonBase);
    priorityList.push(buildings.MoonObservatory);
    priorityList.push(buildings.MoonHeliumMine);
    priorityList.push(buildings.MoonIridiumMine);

    priorityList.push(buildings.SunMission);
    priorityList.push(buildings.SunSwarmControl);
    priorityList.push(buildings.SunSwarmSatellite);
    priorityList.push(buildings.SunJumpGate);

    priorityList.push(buildings.GasMission);
    priorityList.push(buildings.GasStorage);
    priorityList.push(buildings.GasSpaceDock);
    priorityList.push(buildings.GasSpaceDockProbe);
    priorityList.push(buildings.GasSpaceDockGECK);
    priorityList.push(buildings.GasSpaceDockShipSegment);

    priorityList.push(buildings.GasMoonMission);
    priorityList.push(buildings.GasMoonDrone);

    priorityList.push(buildings.Blackhole);
    priorityList.push(buildings.BlackholeStellarEngine);
    priorityList.push(buildings.BlackholeJumpShip);
    priorityList.push(buildings.BlackholeWormholeMission);
    priorityList.push(buildings.BlackholeStargate);

    priorityList.push(buildings.SiriusMission);
    priorityList.push(buildings.SiriusAnalysis);
    priorityList.push(buildings.SiriusSpaceElevator);
    priorityList.push(buildings.SiriusGravityDome);
    priorityList.push(buildings.SiriusThermalCollector);
    priorityList.push(buildings.SiriusAscensionMachine);
    //priorityList.push(buildings.SiriusAscend); // This is performing the actual ascension. We'll deal with this in prestige automation

    priorityList.push(buildings.BlackholeStargateComplete); // Should be powered before Andromeda

    priorityList.push(buildings.GatewayMission);
    priorityList.push(buildings.GatewayStarbase);
    priorityList.push(buildings.GatewayShipDock);

    priorityList.push(buildings.StargateStation);
    priorityList.push(buildings.StargateTelemetryBeacon);

    priorityList.push(buildings.Dreadnought);
    priorityList.push(buildings.CruiserShip);
    priorityList.push(buildings.FrigateShip);
    priorityList.push(buildings.BologniumShip);
    priorityList.push(buildings.CorvetteShip);
    priorityList.push(buildings.ScoutShip);

    priorityList.push(buildings.GorddonMission);
    priorityList.push(buildings.GorddonEmbassy);
    priorityList.push(buildings.GorddonDormitory);
    priorityList.push(buildings.GorddonSymposium);
    priorityList.push(buildings.GorddonFreighter);

    priorityList.push(buildings.NeutronCitadel); // TODO: Having it bellow ascension/terraformer cause flickering when it disables, reduces quantum level, and it disables solar swarms reducing power.
    priorityList.push(buildings.SiriusAscensionTrigger); // This is the 10,000 power one, buildings below this one should be safe to underpower for ascension. Buildings above this either provides, or support population
    priorityList.push(buildings.RedAtmoTerraformer); // Orbit Decay terraformer, 5,000 power
    priorityList.push(buildings.BlackholeMassEjector); // Top priority of safe buildings, disable *only* for ascension, otherwise we want to have them on at any cost, to keep pumping black hole
    priorityList.push(buildings.PitSoulForge);

    priorityList.push(buildings.Alien1Consulate);
    priorityList.push(buildings.Alien1Resort);
    priorityList.push(buildings.Alien1VitreloyPlant);
    priorityList.push(buildings.Alien1SuperFreighter);

    //priorityList.push(buildings.Alien2Mission);
    priorityList.push(buildings.Alien2Foothold);
    priorityList.push(buildings.Alien2Scavenger);
    priorityList.push(buildings.Alien2ArmedMiner);
    priorityList.push(buildings.Alien2OreProcessor);

    //priorityList.push(buildings.ChthonianMission);
    priorityList.push(buildings.ChthonianMineLayer);
    priorityList.push(buildings.ChthonianExcavator);
    priorityList.push(buildings.ChthonianRaider);

    priorityList.push(buildings.Wardenclyffe);
    priorityList.push(buildings.BioLab);
    priorityList.push(buildings.DwarfWorldController);
    priorityList.push(buildings.BlackholeFarReach);

    priorityList.push(buildings.NebulaMission);
    priorityList.push(buildings.NebulaNexus);
    priorityList.push(buildings.NebulaHarvester);
    priorityList.push(buildings.NebulaEleriumProspector);

    priorityList.push(buildings.BeltMission);
    priorityList.push(buildings.BeltSpaceStation);
    priorityList.push(buildings.BeltEleriumShip);
    priorityList.push(buildings.BeltIridiumShip);
    priorityList.push(buildings.BeltIronShip);

    priorityList.push(buildings.CementPlant);
    priorityList.push(buildings.Factory);
    priorityList.push(buildings.GasMoonOutpost);
    priorityList.push(buildings.StargateDefensePlatform);
    priorityList.push(buildings.RedFactory);
    priorityList.push(buildings.AlphaMegaFactory);

    priorityList.push(buildings.PortalTurret);
    priorityList.push(buildings.BadlandsSensorDrone);
    priorityList.push(buildings.PortalWarDroid);
    priorityList.push(buildings.BadlandsPredatorDrone);
    priorityList.push(buildings.BadlandsAttractor);
    priorityList.push(buildings.PortalCarport);
    priorityList.push(buildings.BadlandsMinions);
    priorityList.push(buildings.BadlandsReaper);
    priorityList.push(buildings.BadlandsCorpsePile);
    priorityList.push(buildings.BadlandsMortuary);
    priorityList.push(buildings.BadlandsCodex);
    priorityList.push(buildings.PitGunEmplacement);
    priorityList.push(buildings.PitSoulAttractor);
    priorityList.push(buildings.PitSoulCapacitor);
    priorityList.push(buildings.PitAbsorptionChamber);
    priorityList.push(buildings.PitShadowMine);
    priorityList.push(buildings.PitTavern);
    priorityList.push(buildings.PortalRepairDroid);
    priorityList.push(buildings.PitMission);
    priorityList.push(buildings.PitAssaultForge);
    priorityList.push(buildings.RuinsAncientPillars);

    priorityList.push(buildings.WastelandThrone);
    priorityList.push(buildings.WastelandWarehouse);
    priorityList.push(buildings.WastelandHovel);
    priorityList.push(buildings.WastelandHellCasino);
    priorityList.push(buildings.WastelandTwistedLab);
    priorityList.push(buildings.WastelandDemonForge);
    priorityList.push(buildings.WastelandHellFactory);
    priorityList.push(buildings.WastelandPumpjack);
    priorityList.push(buildings.WastelandDigDemon);
    priorityList.push(buildings.WastelandTunneler);
    priorityList.push(buildings.WastelandBrute);
    priorityList.push(buildings.WastelandAltar);
    priorityList.push(buildings.WastelandShrine);
    priorityList.push(buildings.WastelandMeditationChamber);

    priorityList.push(buildings.RuinsMission);
    priorityList.push(buildings.RuinsGuardPost);
    priorityList.push(buildings.RuinsVault);
    priorityList.push(buildings.RuinsWarVault);
    priorityList.push(buildings.RuinsArchaeology);

    priorityList.push(buildings.GateMission);
    priorityList.push(buildings.GateEastTower);
    priorityList.push(buildings.GateWestTower);
    priorityList.push(buildings.GateTurret);
    priorityList.push(buildings.GateInferniteMine);

    priorityList.push(buildings.LakeMission);
    priorityList.push(buildings.LakeCoolingTower);
    priorityList.push(buildings.LakeHarbor);
    priorityList.push(buildings.LakeBireme);
    priorityList.push(buildings.LakeTransport);
    priorityList.push(buildings.LakeOven);
    priorityList.push(buildings.LakeOvenComplete);
    priorityList.push(buildings.LakeSoulSteeper);
    priorityList.push(buildings.LakeLifeInfuser);

    priorityList.push(buildings.SpireMission);
    priorityList.push(buildings.SpirePurifier);
    priorityList.push(buildings.SpireMechBay);
    priorityList.push(buildings.SpireBaseCamp);
    priorityList.push(buildings.SpirePort);
    priorityList.push(buildings.SpireBridge);
    priorityList.push(buildings.SpireSphinx);
    priorityList.push(buildings.SpireBribeSphinx);
    priorityList.push(buildings.SpireSurveyTower);
    priorityList.push(buildings.SpireWaygate);
    priorityList.push(buildings.SpireEdenicGate);
    priorityList.push(buildings.SpireBazaar);

    priorityList.push(buildings.AsphodelMission);
    priorityList.push(buildings.AsphodelMechStation);
    priorityList.push(buildings.AsphodelHarvester);
    priorityList.push(buildings.AsphodelProcessor);
    priorityList.push(buildings.AsphodelResearchStation);
    priorityList.push(buildings.AsphodelWarehouse);
    priorityList.push(buildings.AsphodelStabilizer);
    priorityList.push(buildings.AsphodelRuneGate);
    priorityList.push(buildings.AsphodelBunker);
    priorityList.push(buildings.AsphodelBlissDen);

    priorityList.push(buildings.ElysiumMission);
    priorityList.push(buildings.ElysiumAmbush);
    priorityList.push(buildings.ElysiumRaid);
    priorityList.push(buildings.ElysiumSiege);
    priorityList.push(buildings.ElysiumScout);
    priorityList.push(buildings.ElysiumFireSupportBase);
    priorityList.push(buildings.ElysiumMine);
    priorityList.push(buildings.ElysiumSacredSmelter);
    priorityList.push(buildings.ElysiumEleriumContainment);
    priorityList.push(buildings.ElysiumPillbox);
    priorityList.push(buildings.ElysiumRestaurant);
    priorityList.push(buildings.ElysiumEternalBank);
    priorityList.push(buildings.ElysiumArchive);
    priorityList.push(buildings.ElysiumNorthPier);
    priorityList.push(buildings.ElysiumRushmore);
    priorityList.push(buildings.ElysiumReincarnation);
    priorityList.push(buildings.ElysiumCement);

    priorityList.push(buildings.IsleSouthPier);
    priorityList.push(buildings.IsleSpiritBattery);
    priorityList.push(buildings.IsleSpiritVacuum);
    priorityList.push(buildings.IsleSoulCompactor);

    priorityList.push(buildings.PalaceMission);
    priorityList.push(buildings.PalaceInfuser);
    priorityList.push(buildings.PalaceConduit);
    priorityList.push(buildings.PalaceTomb);
    //priorityList.push(buildings.PalaceApotheosis);

    priorityList.push(buildings.HellSmelter);
    priorityList.push(buildings.DwarfShipyard);
    priorityList.push(buildings.DwarfMassRelay);
    priorityList.push(buildings.TitanMission);
    priorityList.push(buildings.TitanSpaceport);

    priorityList.push(buildings.TitanAIColonist);
    priorityList.push(buildings.TitanMine);
    priorityList.push(buildings.TitanSAM);
    priorityList.push(buildings.TitanGraphene);
    priorityList.push(buildings.TitanStorehouse);
    priorityList.push(buildings.TitanBank);
    priorityList.push(buildings.TitanAI);
    priorityList.push(buildings.TitanAIComplete);
    priorityList.push(buildings.TitanDecoder);
    priorityList.push(buildings.EnceladusMission);
    priorityList.push(buildings.EnceladusZeroGLab);
    priorityList.push(buildings.EnceladusWaterFreighter);
    priorityList.push(buildings.EnceladusBase);
    priorityList.push(buildings.EnceladusMunitions);
    priorityList.push(buildings.TritonMission);
    priorityList.push(buildings.TritonFOB);
    priorityList.push(buildings.TritonLander);
    //priorityList.push(buildings.TritonCrashedShip);
    priorityList.push(buildings.MakemakeMission);
    priorityList.push(buildings.MakemakeOrichalcum);
    priorityList.push(buildings.MakemakeUranium);
    priorityList.push(buildings.MakemakeNeutronium);
    priorityList.push(buildings.MakemakeElerium);
    priorityList.push(buildings.ErisMission);
    priorityList.push(buildings.ErisDrone);
    priorityList.push(buildings.ErisTank);
    priorityList.push(buildings.ErisTrooper);
    //priorityList.push(buildings.ErisDigsite);

    priorityList.push(buildings.TauStarRingworld);
    priorityList.push(buildings.TauStarMatrix);
    //priorityList.push(buildings.TauStarBluePill);
    priorityList.push(buildings.TauStarEden);

    priorityList.push(buildings.TauMission);
    priorityList.push(buildings.TauDismantle);
    priorityList.push(buildings.TauOrbitalStation);
    priorityList.push(buildings.TauFarm);
    priorityList.push(buildings.TauColony);
    priorityList.push(buildings.TauHousing);
    priorityList.push(buildings.TauExcavate);
    priorityList.push(buildings.TauAlienOutpost);
    priorityList.push(buildings.TauJumpGate);
    priorityList.push(buildings.TauRepository);
    priorityList.push(buildings.TauFactory);
    priorityList.push(buildings.TauDiseaseLab);
    priorityList.push(buildings.TauCasino);
    priorityList.push(buildings.TauCulturalCenter);
    priorityList.push(buildings.TauMiningPit);

    priorityList.push(buildings.TauRedMission);
    priorityList.push(buildings.TauRedOrbitalPlatform);
    priorityList.push(buildings.TauRedContact);
    priorityList.push(buildings.TauRedIntroduce);
    priorityList.push(buildings.TauRedSubjugate);
    //priorityList.push(buildings.TauRedJeff);
    priorityList.push(buildings.TauRedWomlingVillage);
    priorityList.push(buildings.TauRedWomlingFarm);
    priorityList.push(buildings.TauRedWomlingLab);
    priorityList.push(buildings.TauRedWomlingMine);
    priorityList.push(buildings.TauRedWomlingFun);
    priorityList.push(buildings.TauRedOverseer);

    priorityList.push(buildings.TauGasContest);
    priorityList.push(buildings.TauGasName1);
    priorityList.push(buildings.TauGasName2);
    priorityList.push(buildings.TauGasName3);
    priorityList.push(buildings.TauGasName4);
    priorityList.push(buildings.TauGasName5);
    priorityList.push(buildings.TauGasName6);
    priorityList.push(buildings.TauGasName7);
    priorityList.push(buildings.TauGasName8);
    priorityList.push(buildings.TauGasRefuelingStation);
    priorityList.push(buildings.TauGasOreRefinery);
    priorityList.push(buildings.TauGasWhalingStation);
    priorityList.push(buildings.TauGasWomlingStation);

    priorityList.push(buildings.TauBeltMission);
    priorityList.push(buildings.TauBeltPatrolShip);
    priorityList.push(buildings.TauBeltMiningShip);
    priorityList.push(buildings.TauBeltWhalingShip);

    priorityList.push(buildings.TauGas2Contest);
    priorityList.push(buildings.TauGas2Name1);
    priorityList.push(buildings.TauGas2Name2);
    priorityList.push(buildings.TauGas2Name3);
    priorityList.push(buildings.TauGas2Name4);
    priorityList.push(buildings.TauGas2Name5);
    priorityList.push(buildings.TauGas2Name6);
    priorityList.push(buildings.TauGas2Name7);
    priorityList.push(buildings.TauGas2Name8);
    priorityList.push(buildings.TauGas2AlienSurvey);
    priorityList.push(buildings.TauGas2AlienStation);
    priorityList.push(buildings.TauGas2MatrioshkaBrain);
    priorityList.push(buildings.TauGas2IgnitionDevice);
    priorityList.push(buildings.TauGas2IgniteGasGiant);

    priorityList.push(buildings.StargateDepot);
    priorityList.push(buildings.DwarfEleriumContainer);

    priorityList.push(buildings.GasMoonOilExtractor);
    priorityList.push(buildings.NeutronMission);
    priorityList.push(buildings.NeutronStellarForge);
    priorityList.push(buildings.NeutronMiner);

    priorityList.push(buildings.MassDriver);
    priorityList.push(buildings.MetalRefinery);
    priorityList.push(buildings.Casino);
    priorityList.push(buildings.HellSpaceCasino);
    priorityList.push(buildings.RockQuarry);
    priorityList.push(buildings.Sawmill);
    priorityList.push(buildings.GasMining);
    priorityList.push(buildings.Mine);
    priorityList.push(buildings.CoalMine);

    const available = priorityList.filter((b) => b !== undefined);
    BuildingManager.priorityList = available;
    BuildingManager.statePriorityList = available.filter((b) =>
      b.isSwitchable(),
    );
  }

  return { initBuildingState };
}
