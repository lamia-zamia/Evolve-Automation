type CountBuilding = { count: number };
type ActiveBuilding = { stateOnCount: number };
type MissionBuilding = { isUnlocked: () => boolean };
type RatedShip = { ship: { rating: () => number } };

type GalaxyBuildings = {
  ScoutShip: CountBuilding;
  CorvetteShip: CountBuilding;
  FrigateShip: CountBuilding;
  CruiserShip: CountBuilding;
  Dreadnought: CountBuilding;
  ChthonianMission: MissionBuilding;
  Alien2Mission: MissionBuilding;
  StargateDefensePlatform: ActiveBuilding;
  GatewayStarbase: ActiveBuilding;
  BologniumShip: ActiveBuilding;
  GorddonFreighter: ActiveBuilding;
  Alien1SuperFreighter: ActiveBuilding;
  GorddonSymposium: ActiveBuilding;
  Alien1VitreloyPlant: ActiveBuilding;
  Alien2Foothold: ActiveBuilding;
  Alien2ArmedMiner: ActiveBuilding;
  Alien2Scavenger: ActiveBuilding;
  ChthonianMineLayer: ActiveBuilding;
  ChthonianRaider: ActiveBuilding;
  ChthonianExcavator: ActiveBuilding;
};

type GalaxyGame = {
  global: {
    race: {
      chicken?: unknown;
      ocularPowerConfig?: { f?: unknown };
      [key: string]: unknown;
    };
    tech: { piracy: number };
  };
  actions: {
    galaxy: {
      gxy_gateway: {
        scout_ship: RatedShip;
        corvette_ship: RatedShip;
        frigate_ship: RatedShip;
        cruiser_ship: RatedShip;
        dreadnought: RatedShip;
      };
      gxy_alien2: { armed_miner: RatedShip };
      gxy_chthonian: { minelayer: RatedShip; raider: RatedShip };
    };
  };
};

type GalaxyIntelligenceDependencies = {
  getGame: () => GalaxyGame;
  getBuildings: () => GalaxyBuildings;
  getSettings: () => { fleetChthonianLoses: string };
  getTraitVal: () => (
    trait: string,
    index: number,
    operation?: string,
  ) => number;
};

export function createGalaxyIntelligence({
  getGame,
  getBuildings,
  getSettings,
  getTraitVal,
}: GalaxyIntelligenceDependencies) {
  function getGalaxyCombatShipPower() {
    const buildings = getBuildings();
    const gateway = getGame().actions.galaxy.gxy_gateway;
    return (
      buildings.ScoutShip.count * gateway.scout_ship.ship.rating() +
      buildings.CorvetteShip.count * gateway.corvette_ship.ship.rating() +
      buildings.FrigateShip.count * gateway.frigate_ship.ship.rating() +
      buildings.CruiserShip.count * gateway.cruiser_ship.ship.rating() +
      buildings.Dreadnought.count * gateway.dreadnought.ship.rating()
    );
  }

  function getPiracyMultiplier() {
    const race = getGame().global.race;
    const traitVal = getTraitVal();
    return (
      1 *
      (race.chicken ? traitVal("chicken", 1, "+") : 1) *
      (race["ocular_power"] && race.ocularPowerConfig?.f
        ? 1 - traitVal("ocular_power", 1) / 500
        : 1)
    );
  }

  // While a fleet is being accumulated for an assault mission we neither cap ship purchases nor reclaim crews
  function galaxyAssaultPending() {
    const buildings = getBuildings();
    return (
      (buildings.ChthonianMission.isUnlocked() &&
        getSettings().fleetChthonianLoses !== "ignore") ||
      buildings.Alien2Mission.isUnlocked()
    );
  }

  // Andromeda regions with piracy (already multiplied) and their static, ship-independent defenses
  function getGalaxyRegions() {
    const game = getGame();
    const buildings = getBuildings();
    const instinct = game.global.race["instinct"];
    const allRegions = [
      {
        name: "gxy_stargate",
        piracy: (instinct ? 0.09 : 0.1) * game.global.tech.piracy,
        armada: buildings.StargateDefensePlatform.stateOnCount * 20,
        useful: true,
      },
      {
        name: "gxy_gateway",
        piracy: (instinct ? 0.09 : 0.1) * game.global.tech.piracy,
        armada: buildings.GatewayStarbase.stateOnCount * 25,
        useful: buildings.BologniumShip.stateOnCount > 0,
      },
      {
        name: "gxy_gorddon",
        piracy: instinct ? 720 : 800,
        armada: 0,
        useful:
          buildings.GorddonFreighter.stateOnCount > 0 ||
          buildings.Alien1SuperFreighter.stateOnCount > 0 ||
          buildings.GorddonSymposium.stateOnCount > 0,
      },
      {
        name: "gxy_alien1",
        piracy: instinct ? 900 : 1000,
        armada: 0,
        useful: buildings.Alien1VitreloyPlant.stateOnCount > 0,
      },
      {
        name: "gxy_alien2",
        piracy: instinct ? 2250 : 2500,
        armada:
          buildings.Alien2Foothold.stateOnCount * 50 +
          buildings.Alien2ArmedMiner.stateOnCount *
            game.actions.galaxy.gxy_alien2.armed_miner.ship.rating(),
        useful:
          buildings.Alien2Scavenger.stateOnCount > 0 ||
          buildings.Alien2ArmedMiner.stateOnCount > 0,
      },
      {
        name: "gxy_chthonian",
        piracy: instinct ? 7000 : 7500,
        armada:
          buildings.ChthonianMineLayer.stateOnCount *
            game.actions.galaxy.gxy_chthonian.minelayer.ship.rating() +
          buildings.ChthonianRaider.stateOnCount *
            game.actions.galaxy.gxy_chthonian.raider.ship.rating(),
        useful:
          buildings.ChthonianExcavator.stateOnCount > 0 ||
          buildings.ChthonianRaider.stateOnCount > 0,
      },
    ];
    const piracyMultiplier = getPiracyMultiplier();
    if (piracyMultiplier !== 1) {
      allRegions.forEach((region) => {
        region.piracy *= piracyMultiplier;
      });
    }
    return allRegions;
  }

  return {
    getGalaxyCombatShipPower,
    getPiracyMultiplier,
    galaxyAssaultPending,
    getGalaxyRegions,
  };
}
