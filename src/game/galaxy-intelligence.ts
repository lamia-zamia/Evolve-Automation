import {
  decideGalaxyPiracyProtection,
  type GalaxyPiracyResourceId,
} from "../domain/combat/galaxy-piracy.ts";

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
    galaxy?: { trade?: Readonly<Record<string, unknown>> };
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

type UsefulResource = { isUseful: () => boolean; storageRatio: number };
type GalaxyResources = Readonly<Record<string, UsefulResource | undefined>>;
type GalaxyTradeOffer = { readonly buy: { readonly res: string } };

type GalaxyIntelligenceDependencies = {
  getGame: () => GalaxyGame;
  getBuildings: () => GalaxyBuildings;
  getResources: () => GalaxyResources;
  getGalaxyOffers: () => readonly GalaxyTradeOffer[];
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
  getResources,
  getGalaxyOffers,
  getSettings,
  getTraitVal,
}: GalaxyIntelligenceDependencies) {
  const piracyResources: readonly GalaxyPiracyResourceId[] = [
    "Adamantite",
    "Bolognium",
    "Iridium",
    "Knowledge",
    "Orichalcum",
    "Vitreloy",
  ];

  function resourceBenefitsFromPiracy(resourceId: string): boolean {
    const resource = getResources()[resourceId];
    if (resource?.isUseful() !== true) {
      return false;
    }
    // Knowledge production expands capacity. Material production needs storage headroom;
    // isUseful() alone can remain true at cap when a target demands more than can be stored.
    return (
      resourceId === "Knowledge" ||
      (Number.isFinite(resource.storageRatio) && resource.storageRatio < 0.99)
    );
  }

  function gorddonTradeTargetsUsefulResource(): boolean {
    const trade = getGame().global.galaxy?.trade;
    if (trade === undefined) {
      return false;
    }
    return getGalaxyOffers().some((offer, index) => {
      const activeRoutes = trade[`f${index}`];
      return (
        typeof activeRoutes === "number" &&
        activeRoutes > 0 &&
        resourceBenefitsFromPiracy(offer.buy.res)
      );
    });
  }

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

  // Andromeda regions with piracy (already multiplied), static defenses, and whether reducing
  // piracy improves an output the current automation cycle needs.
  function getGalaxyRegions() {
    const game = getGame();
    const buildings = getBuildings();
    const instinct = game.global.race["instinct"];
    const usefulResources = Object.fromEntries(
      piracyResources.map((resourceId) => [
        resourceId,
        resourceBenefitsFromPiracy(resourceId),
      ]),
    ) as Record<GalaxyPiracyResourceId, boolean>;
    const protection = decideGalaxyPiracyProtection({
      producers: {
        bologniumShip: buildings.BologniumShip.stateOnCount > 0,
        gorddonSymposium: buildings.GorddonSymposium.stateOnCount > 0,
        alien1VitreloyPlant: buildings.Alien1VitreloyPlant.stateOnCount > 0,
        alien2ArmedMiner: buildings.Alien2ArmedMiner.stateOnCount > 0,
        alien2Scavenger: buildings.Alien2Scavenger.stateOnCount > 0,
        chthonianExcavator: buildings.ChthonianExcavator.stateOnCount > 0,
      },
      usefulResources,
      gorddonTradeTargetsUsefulResource: gorddonTradeTargetsUsefulResource(),
    });
    const allRegions = [
      {
        name: "gxy_stargate",
        piracy: (instinct ? 0.09 : 0.1) * game.global.tech.piracy,
        armada: buildings.StargateDefensePlatform.stateOnCount * 20,
        useful: protection.gxy_stargate,
      },
      {
        name: "gxy_gateway",
        piracy: (instinct ? 0.09 : 0.1) * game.global.tech.piracy,
        armada: buildings.GatewayStarbase.stateOnCount * 25,
        useful: protection.gxy_gateway,
      },
      {
        name: "gxy_gorddon",
        piracy: instinct ? 720 : 800,
        armada: 0,
        useful: protection.gxy_gorddon,
      },
      {
        name: "gxy_alien1",
        piracy: instinct ? 900 : 1000,
        armada: 0,
        useful: protection.gxy_alien1,
      },
      {
        name: "gxy_alien2",
        piracy: instinct ? 2250 : 2500,
        armada:
          buildings.Alien2Foothold.stateOnCount * 50 +
          buildings.Alien2ArmedMiner.stateOnCount *
            game.actions.galaxy.gxy_alien2.armed_miner.ship.rating(),
        useful: protection.gxy_alien2,
      },
      {
        name: "gxy_chthonian",
        piracy: instinct ? 7000 : 7500,
        armada:
          buildings.ChthonianMineLayer.stateOnCount *
            game.actions.galaxy.gxy_chthonian.minelayer.ship.rating() +
          buildings.ChthonianRaider.stateOnCount *
            game.actions.galaxy.gxy_chthonian.raider.ship.rating(),
        useful: protection.gxy_chthonian,
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
