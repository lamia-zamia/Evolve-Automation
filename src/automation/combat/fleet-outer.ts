import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  | "getFleetManagerOuter"
  | "getWarManager"
  | "getGame"
  | "getSettings"
  | "getResources"
  | "GameLog"
>;
export function createAutoFleetOuter({
  getFleetManagerOuter,
  getWarManager,
  getGame,
  getSettings,
  getResources,
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

    let missing = m.getMissingResource(newShip);
    if (missing) {
      m.nextShipMsg = `Next ship(${m.nextShipName}) is missing ${resources[missing].name}`;
      return;
    }

    if (WarManager.currentCityGarrison - m.ClassCrew[newShip.class] < minCrew) {
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
