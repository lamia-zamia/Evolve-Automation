import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  | "getFleetManagerOuter"
  | "getWarManager"
  | "getGame"
  | "getSettings"
  | "getResources"
  | "traitVal"
  | "assessAuthorityRemoval"
  | "GameLog"
>;
export function createAutoFleetOuter({
  getFleetManagerOuter,
  getWarManager,
  getGame,
  getSettings,
  getResources,
  traitVal,
  assessAuthorityRemoval,
  GameLog,
}: Dependencies) {
  return function autoFleetOuter() {
    const FleetManagerOuter = getFleetManagerOuter();
    const WarManager = getWarManager();
    const game = getGame();
    const settings = getSettings();
    const resources = getResources();
    let m = FleetManagerOuter;
    if (!m.initFleet()) {
      m.nextShipMsg = `No ships needed yet`;
      m.updateNextShip();
      return;
    }

    if (settings.fleetOuterShips === "none") {
      m.updateNextShip();
      m.nextShipMsg = `Ship construction is disabled`;
      return;
    }

    let yard = game.global.space.shipyard;

    if (settings.fleetOuterShips === "manual") {
      m.updateNextShip(m.avail(yard.blueprint) ? yard.blueprint : null);
      m.nextShipMsg = `Ships managed manually`;
      return;
    }

    let targetRegion = null;
    let newShip = null;
    let minCrew = settings.fleetOuterCrew; // Ignored by Tau Explorer and Eris Scout

    const getDefenseTarget = (region: string) => {
      let target = m.getMaxDefense(region);
      if (
        region !== "spc_eris" ||
        game.global.space.digsite?.count === undefined ||
        game.global.space.digsite.count >= 100
      ) {
        return target;
      }

      // Digsite damage is multiplied by Eris fleet defense. The historical 0.01 default was only
      // enough to scan Eris; once syndicate pressure reaches its cap it leaves even a huge ground
      // force doing exactly zero damage. Estimate the active force conservatively (one attack per
      // supported Trooper, 100 per supported Tank) and maintain enough fleet defense for its random
      // damage roll to comfortably beat the Digsite's average 137.5-point regeneration.
      const requestedTroopers = game.global.space.shock_trooper?.on ?? 0;
      const requestedTanks = game.global.space.tank?.on ?? 0;
      const requestedUnits = requestedTroopers + requestedTanks;
      const reportedSupport = resources.Eris_Support?.currentQuantity;
      const supportedUnits = Number.isFinite(reportedSupport)
        ? Math.min(requestedUnits, reportedSupport)
        : requestedUnits;
      const activeTroopers = Math.min(requestedTroopers, supportedUnits);
      const activeTanks = Math.min(
        requestedTanks,
        Math.max(0, supportedUnits - activeTroopers),
      );
      const conservativeGroundPower = activeTroopers + activeTanks * 100;
      const digsiteDefense =
        conservativeGroundPower > 0
          ? Math.min(0.9, 350 / conservativeGroundPower)
          : 0.5;

      return Math.max(target, digsiteDefense);
    };

    if (
      settings.fleetExploreTau &&
      game.global.tech["tauceti"] === 1 &&
      m.avail(m._explorerBlueprint) &&
      m.shipCount("tauceti", m._explorerBlueprint) < 1
    ) {
      targetRegion = "tauceti";
      newShip = m._explorerBlueprint;
      minCrew = 0;
    } else {
      let scanEris =
        game.global.tech["eris"] === 1 &&
        m.getWeighting("spc_eris") > 0 &&
        m.syndicate("spc_eris", true, true).s < 50;
      if (scanEris) {
        targetRegion = "spc_eris";
        minCrew = 0;
      } else {
        let regionsToProtect = m.Regions.filter(
          (reg) =>
            m.isUnlocked(reg) &&
            m.getWeighting(reg) > 0 &&
            m.syndicate(reg, false, true) < getDefenseTarget(reg),
        ).sort(
          (a, b) =>
            (1 - m.syndicate(b, false, true)) * m.getWeighting(b) -
            (1 - m.syndicate(a, false, true)) * m.getWeighting(a),
        );

        if (regionsToProtect.length < 1) {
          m.updateNextShip();
          m.nextShipMsg = `No more ships currently needed`;
          return;
        }
        targetRegion = regionsToProtect[0];
      }

      if (settings.fleetOuterShips === "user") {
        newShip = m.avail(yard.blueprint) ? yard.blueprint : null;
      } else {
        let scout = m.getScoutBlueprint();
        if (
          m.avail(scout) &&
          m.shipCount(targetRegion, scout) < m.getMaxScouts(targetRegion)
        ) {
          newShip = scout;
        }
        if (!newShip) {
          let fighter = m.getFighterBlueprint();
          newShip = m.avail(fighter) ? fighter : null;
        }
      }
    }

    if (!newShip) {
      m.updateNextShip();
      m.nextShipMsg = `No suitable blueprint for ship to ${m.getLocName(
        targetRegion,
      )}`;
      return;
    }

    m.updateNextShip(newShip);
    m.nextShipName = `${m.getShipName(newShip)} to ${m.getLocName(
      targetRegion,
    )}`;

    const baseCrew = game.global.race["grenadier"]
      ? {
          corvette: 1,
          frigate: 2,
          destroyer: 3,
          cruiser: 4,
          battlecruiser: 5,
          dreadnought: 6,
          explorer: 6,
        }[newShip.class]
      : m.ClassCrew[newShip.class];
    const shipCrew = baseCrew * traitVal("high_pop", 0, 1);

    // In Evil, outer ships permanently remove their crew from the home garrison. Before Hell is
    // available those idle home soldiers are the only controllable source of Authority, so a fleet
    // expansion can otherwise lock the run into a production/army penalty while every region is
    // already over-defended.
    if (
      settings.authorityManage &&
      settings.generalMinimumAuthority !== 0 &&
      game.global.race.universe === "evil" &&
      resources.Authority.isUnlocked()
    ) {
      const assessment = assessAuthorityRemoval(shipCrew);
      if (assessment.status === "unavailable") {
        m.nextShipMsg = `Authority data unavailable; ship construction paused`;
        return;
      }
      if (assessment.status === "ready" && assessment.blocksRemoval) {
        m.nextShipMsg = `Next ship(${m.nextShipName}) would lower Authority to ${assessment.predicted}, below the ${assessment.target} target`;
        return;
      }
    }

    let missing = m.getMissingResource(newShip);
    if (missing) {
      m.nextShipMsg = `Next ship(${m.nextShipName}) is missing ${resources[missing].name}`;
      return;
    }

    if (WarManager.currentCityGarrison - shipCrew < minCrew) {
      m.nextShipMsg = `Next ship(${m.nextShipName}) is missing crew`;
      return;
    }

    if (m.build(newShip, targetRegion)) {
      GameLog.logSuccess(
        "outer_fleet",
        `${m.getShipName(
          newShip,
        )} has been assembled, and dispatched to ${m.getLocName(
          targetRegion,
        )}.`,
        ["combat"],
      );
    } else {
      m.nextShipMsg = `Invalid design! Next ship(${m.nextShipName}) is missing power`;
      return;
    }
  };
}
