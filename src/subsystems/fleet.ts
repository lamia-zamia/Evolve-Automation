import type { SubsystemDependencies } from "./types.ts";

type Dependencies = SubsystemDependencies<
  | "getFleetManager"
  | "getGame"
  | "getSettings"
  | "getState"
  | "getResources"
  | "getBuildings"
  | "getGalaxyRegions"
  | "guardActive"
  | "cartesian"
  | "galaxyAssaultPending"
>;
export function createAutoFleet({ getFleetManager, getGame, getSettings, getState, getResources, getBuildings, getGalaxyRegions, guardActive, cartesian, galaxyAssaultPending }: Dependencies) {
  return function autoFleet() {
    const FleetManager = getFleetManager();
    const game = getGame();
    const settings = getSettings();
    const state = getState();
    const resources = getResources();
    const buildings = getBuildings();
    if (!FleetManager.initFleet()) {
      return;
    }
    let def = game.global.galaxy.defense;

    // Init our current state
    let allRegions = getGalaxyRegions();
    let allFleets = [
      {
        name: "scout_ship",
        building: buildings.ScoutShip,
        count: 0,
        power: game.actions.galaxy.gxy_gateway.scout_ship.ship.rating(),
      },
      {
        name: "corvette_ship",
        building: buildings.CorvetteShip,
        count: 0,
        power: game.actions.galaxy.gxy_gateway.corvette_ship.ship.rating(),
      },
      {
        name: "frigate_ship",
        building: buildings.FrigateShip,
        count: 0,
        power: game.actions.galaxy.gxy_gateway.frigate_ship.ship.rating(),
      },
      {
        name: "cruiser_ship",
        building: buildings.CruiserShip,
        count: 0,
        power: game.actions.galaxy.gxy_gateway.cruiser_ship.ship.rating(),
      },
      {
        name: "dreadnought",
        building: buildings.Dreadnought,
        count: 0,
        power: game.actions.galaxy.gxy_gateway.dreadnought.ship.rating(),
      },
    ] as any[];
    let minPower = allFleets[0].power;

    // We can't rely on stateOnCount - it won't give us correct number of ships of some of them missing crew
    let fleetIndex = Object.fromEntries(
      allFleets.map((ship, index) => [ship.name, index]),
    );
    Object.values(def).forEach((assigned) =>
      Object.entries(assigned).forEach(
        ([ship, count]) =>
          (allFleets[fleetIndex[ship]].count += Math.floor(count)),
      ),
    );

    // Check if we can perform assault mission
    let assault = null;
    if (
      buildings.ChthonianMission.isUnlocked() &&
      settings.fleetChthonianLoses !== "ignore"
    ) {
      // Dreaded guard: never sacrifice a dreadnought while the achievement is on the line
      let chthonianLoses =
        settings.fleetChthonianLoses === "dread" && guardActive("guardDreaded")
          ? "high"
          : settings.fleetChthonianLoses;
      let fleetReq, fleetWreck;
      if (chthonianLoses === "low") {
        fleetReq = 4500;
        fleetWreck = 80;
      } else if (chthonianLoses === "avg") {
        fleetReq = 2500;
        fleetWreck = 160;
      } else if (chthonianLoses === "high") {
        fleetReq = 1250;
        fleetWreck = 500;
      } else if (chthonianLoses === "dread") {
        if (allFleets[4].count > 0) {
          assault = {
            ships: [0, 0, 0, 0, 1],
            region: "gxy_chthonian",
            mission: buildings.ChthonianMission,
          };
        }
      } else if (chthonianLoses === "frigate") {
        let totalPower = allFleets.reduce(
          (sum, ship) =>
            sum +
            (ship.power >= allFleets[2].power ? ship.power * ship.count : 0),
          0,
        );
        if (totalPower >= 4500) {
          assault = {
            ships: allFleets.map((ship, idx) => (idx >= 2 ? ship.count : 0)),
            region: "gxy_chthonian",
            mission: buildings.ChthonianMission,
          };
        }
      }
      if (game.global.race["instinct"]) {
        fleetWreck /= 2;
      }

      let availableShips = allFleets.map((ship) => ship.count);
      let powerToReserve = fleetReq - fleetWreck;
      for (
        let i = availableShips.length - 1;
        i >= 0 && powerToReserve > 0;
        i--
      ) {
        let reservedShips = Math.min(
          availableShips[i],
          Math.ceil(powerToReserve / allFleets[i].power),
        );
        availableShips[i] -= reservedShips;
        powerToReserve -= reservedShips * allFleets[i].power;
      }
      if (powerToReserve <= 0) {
        let sets = availableShips.map((amount, idx) => [
          ...Array(
            Math.min(
              amount,
              Math.floor(
                (fleetWreck + (minPower - 0.1)) / allFleets[idx].power,
              ),
            ) + 1,
          ).keys(),
        ]);
        for (let set of cartesian(...sets)) {
          let powerMissing =
            fleetWreck -
            set.reduce((sum, amt, idx) => sum + amt * allFleets[idx].power, 0);
          if (powerMissing <= 0 && powerMissing > minPower * -1) {
            let lastShip = set.reduce(
              (prev, val, cur) => (val > 0 ? cur : prev),
              0,
            );
            let team = allFleets.map((ship, idx) =>
              idx >= lastShip ? ship.count : set[idx],
            );
            assault = {
              ships: team,
              region: "gxy_chthonian",
              mission: buildings.ChthonianMission,
            };
            break;
          }
        }
      }
    } else if (
      buildings.Alien2Mission.isUnlocked() &&
      resources.Knowledge.maxQuantity >= settings.fleetAlien2Knowledge
    ) {
      let totalPower = allFleets.reduce(
        (sum, ship) => sum + ship.power * ship.count,
        0,
      );

      let doAlien2Assault = false;
      if (settings.fleetAlien2Loses === "suicide") {
        doAlien2Assault = totalPower >= 400;
      } else {
        doAlien2Assault = totalPower >= 650;
      }

      if (doAlien2Assault) {
        assault = {
          ships: allFleets.map((ship) => ship.count),
          region: "gxy_alien2",
          mission: buildings.Alien2Mission,
        };
      }
    }
    if (assault) {
      // Unassign all ships from where there're assigned currently
      Object.entries(def).forEach(([region, assigned]) =>
        Object.entries(assigned).forEach(([ship, count]) =>
          FleetManager.subShip(region, ship, count),
        ),
      );
      // Assign to target region
      allFleets.forEach((ship, idx) =>
        FleetManager.addShip(assault.region, ship.name, assault.ships[idx]),
      );
      assault.mission.click();
      return; // We're done for now; lot of data was invalidated during attack, we'll manage remaining ships in next tick
    }

    // With crew reclaim we distribute all built ships, including powered-down ones: ships needed for
    // coverage will be powered back up, surplus powered down by autoPower, releasing crews to the workforce
    let reclaimCrew = settings.fleetCrewReclaim && !galaxyAssaultPending();
    FleetManager.neededShips = null;
    if (reclaimCrew) {
      allFleets.forEach((ship) => (ship.count = ship.building.count));
    }

    let regionsToProtect = allRegions.filter(
      (region) => region.useful && region.piracy - region.armada > 0,
    );

    for (let i = 0; i < allRegions.length; i++) {
      let region = allRegions[i];
      region.priority = settings["fleet_pr_" + region.name];
      region.assigned = {};
      for (let j = 0; j < allFleets.length; j++) {
        region.assigned[allFleets[j].name] = 0;
      }
    }

    // Calculate min allowed coverage, if we have more ships than we can allocate without overflowing.
    let missingDef = regionsToProtect.map(
      (region) => region.piracy - region.armada,
    );
    for (let i = allFleets.length - 1; i >= 0; i--) {
      let ship = allFleets[i];
      let maxAllocate = missingDef.reduce(
        (sum, def) => sum + Math.floor(def / ship.power),
        0,
      );
      if (ship.count > maxAllocate) {
        if (ship.count >= maxAllocate + missingDef.length) {
          ship.cover = 0;
        } else {
          let overflows = missingDef
            .map((def) => def % ship.power)
            .sort((a, b) => b - a);
          ship.cover = overflows[ship.count - maxAllocate - 1];
        }
      } else {
        ship.cover = ship.power - (minPower - 0.1);
      }
      if (ship.count >= maxAllocate) {
        missingDef.forEach((def, idx, arr) => (arr[idx] = def % ship.power));
        if (ship.count > maxAllocate) {
          missingDef.sort((a, b) => b - a);
          for (let j = 0; j < ship.count - maxAllocate; j++) {
            missingDef[j] = 0;
          }
        }
      }
    }
    for (let i = 0; i < allFleets.length; i++) {
      if (allFleets[i].count > 0) {
        allFleets[i].cover = 0.1;
        break;
      }
    }

    // Calculate actual amount of ships per zone
    let priorityList = regionsToProtect.sort((a, b) => a.priority - b.priority);
    for (let i = 0; i < priorityList.length; i++) {
      let region = priorityList[i];
      let missingDef = region.piracy - region.armada;

      // First pass, try to assign ships without overuse (unless we have enough ships to overuse everything)
      for (let k = allFleets.length - 1; k >= 0 && missingDef > 0; k--) {
        let ship = allFleets[k];
        if (ship.cover <= missingDef) {
          let shipsToAssign = Math.min(
            ship.count,
            Math.floor(missingDef / ship.power),
          );
          if (
            shipsToAssign < ship.count &&
            shipsToAssign * ship.power + ship.cover <= missingDef
          ) {
            shipsToAssign++;
          }
          region.assigned[ship.name] += shipsToAssign;
          ship.count -= shipsToAssign;
          missingDef -= shipsToAssign * ship.power;
        }
      }

      if (settings.fleetMaxCover && missingDef > 0) {
        // Second pass, try to fill remaining gaps, if wasteful overuse is allowed
        let index = -1;
        while (missingDef > 0 && ++index < allFleets.length) {
          let ship = allFleets[index];
          if (ship.count > 0) {
            let shipsToAssign = Math.min(
              ship.count,
              Math.ceil(missingDef / ship.power),
            );
            region.assigned[ship.name] += shipsToAssign;
            ship.count -= shipsToAssign;
            missingDef -= shipsToAssign * ship.power;
          }
        }

        // If we're still missing defense it means we have no more ships to assign
        if (missingDef > 0) {
          break;
        }

        // Third pass, retrive ships which not needed after second pass
        while (--index >= 0) {
          let ship = allFleets[index];
          if (region.assigned[ship.name] > 0 && missingDef + ship.power <= 0) {
            let uselesShips = Math.min(
              region.assigned[ship.name],
              Math.floor((missingDef / ship.power) * -1),
            );
            if (uselesShips > 0) {
              region.assigned[ship.name] -= uselesShips;
              ship.count += uselesShips;
              missingDef += uselesShips * ship.power;
            }
          }
        }
      }
    }

    if (reclaimCrew) {
      // Surplus ships stay unassigned, autoPower will shut them down to return their crews to the workforce
      FleetManager.neededShips = Object.fromEntries(
        allFleets.map((ship) => [ship.name, ship.building.count - ship.count]),
      );
    } else if (buildings.GorddonSymposium.stateOnCount > 0) {
      // Assign remaining ships to gorddon, to utilize Symposium
      allFleets.forEach(
        (ship) => (allRegions[2].assigned[ship.name] += ship.count),
      );
    }

    let shipDeltas = allRegions.map((region) =>
      (Object.entries(region.assigned) as [string, number][]).map(([ship, count]) => [
        ship,
        count - def[region.name][ship],
      ]),
    );

    shipDeltas.forEach((ships, region) =>
      ships.forEach(
        ([ship, delta]) =>
          delta < 0 &&
          FleetManager.subShip(allRegions[region].name, ship, delta * -1),
      ),
    );
    shipDeltas.forEach((ships, region) =>
      ships.forEach(
        ([ship, delta]) =>
          delta > 0 &&
          FleetManager.addShip(allRegions[region].name, ship, delta),
      ),
    );
  }
}
