import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  | "getFleetManagerOuter"
  | "getWarManager"
  | "getGame"
  | "getSettings"
  | "getResources"
  | "traitVal"
  | "getAuthorityTarget"
  | "getPredictedAuthorityAfterRemovingSoldiers"
  | "GameLog"
>;
export function createAutoFleetOuter({
  getFleetManagerOuter,
  getWarManager,
  getGame,
  getSettings,
  getResources,
  traitVal,
  getAuthorityTarget,
  getPredictedAuthorityAfterRemovingSoldiers,
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
            m.syndicate(reg, false, true) < m.getMaxDefense(reg),
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
      settings.generalMinimumAuthority !== 0 &&
      game.global.race.universe === "evil" &&
      resources.Authority.isUnlocked()
    ) {
      const authorityTarget = getAuthorityTarget();
      const predictedAuthority =
        getPredictedAuthorityAfterRemovingSoldiers(shipCrew);
      if (authorityTarget !== null && predictedAuthority < authorityTarget) {
        m.nextShipMsg = `Next ship(${m.nextShipName}) would lower Authority to ${predictedAuthority}, below the ${authorityTarget} target`;
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
