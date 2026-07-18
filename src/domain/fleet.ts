export const GALAXY_SHIP_NAMES = Object.freeze([
  "scout_ship",
  "corvette_ship",
  "frigate_ship",
  "cruiser_ship",
  "dreadnought",
] as const);

export type GalaxyShipName = (typeof GALAXY_SHIP_NAMES)[number];
export type GalaxyMission = "chthonian" | "alien2";

export interface GalaxyShipInput {
  readonly name: GalaxyShipName;
  readonly assignedCount: number;
  readonly builtCount: number;
  readonly power: number;
}

export type GalaxyShipCounts = Readonly<Record<GalaxyShipName, number>>;

export interface GalaxyDefenseRegionInput {
  readonly name: string;
  readonly assigned: GalaxyShipCounts;
}

export interface GalaxyRegionInput extends GalaxyDefenseRegionInput {
  readonly useful: boolean;
  readonly piracy: number;
  readonly armada: number;
  readonly priority: number;
}

export interface FleetInput {
  readonly available: boolean;
  readonly ships: readonly GalaxyShipInput[];
  readonly defenseRegions: readonly GalaxyDefenseRegionInput[];
  readonly regions: readonly GalaxyRegionInput[];
  readonly chthonianUnlocked: boolean;
  readonly chthonianLossMode: string;
  readonly dreadedGuardActive: boolean;
  readonly instinct: boolean;
  readonly alien2Unlocked: boolean;
  readonly alien2KnowledgeMaximum: number;
  readonly alien2KnowledgeRequired: number;
  readonly alien2LossMode: string;
  readonly crewReclaim: boolean;
  readonly galaxyAssaultPending: boolean;
  readonly maximumCoverage: boolean;
  readonly gorddonSymposiumActive: boolean;
}

export interface FleetAssignmentCommand {
  readonly kind: "add-ship" | "remove-ship";
  readonly region: string;
  readonly ship: GalaxyShipName;
  readonly count: number;
}

export interface LaunchGalaxyAssaultDecision {
  readonly kind: "launch-galaxy-assault";
  readonly mission: GalaxyMission;
  readonly commands: readonly FleetAssignmentCommand[];
}

export interface ManageGalaxyFleetDecision {
  readonly kind: "manage-galaxy-fleet";
  readonly clearNeededShips: true;
  readonly neededShips: GalaxyShipCounts | null;
  readonly commands: readonly FleetAssignmentCommand[];
}

export type FleetDecision =
  LaunchGalaxyAssaultDecision | ManageGalaxyFleetDecision;

interface MutableShip {
  readonly name: GalaxyShipName;
  readonly builtCount: number;
  readonly power: number;
  count: number;
  cover: number;
}

interface MutableRegion {
  readonly name: string;
  readonly useful: boolean;
  readonly piracy: number;
  readonly armada: number;
  readonly priority: number;
  readonly current: GalaxyShipCounts;
  assigned: Record<GalaxyShipName, number>;
}

interface AssaultPlan {
  readonly mission: GalaxyMission;
  readonly region: string;
  readonly ships: readonly number[];
}

function emptyShipCounts(): Record<GalaxyShipName, number> {
  return {
    scout_ship: 0,
    corvette_ship: 0,
    frigate_ship: 0,
    cruiser_ship: 0,
    dreadnought: 0,
  };
}

function cartesianProduct(sets: readonly (readonly number[])[]): number[][] {
  let products: number[][] = [[]];
  for (const set of sets) {
    const next: number[][] = [];
    for (const product of products) {
      for (const value of set) next.push([...product, value]);
    }
    products = next;
  }
  return products;
}

function freezeCommands(
  commands: readonly FleetAssignmentCommand[],
): readonly FleetAssignmentCommand[] {
  return Object.freeze(
    commands.map((command) => Object.freeze({ ...command })),
  );
}

function planChthonianAssault(
  input: Readonly<FleetInput>,
  ships: readonly MutableShip[],
): AssaultPlan | null {
  if (!input.chthonianUnlocked || input.chthonianLossMode === "ignore") {
    return null;
  }
  const lossMode =
    input.chthonianLossMode === "dread" && input.dreadedGuardActive
      ? "high"
      : input.chthonianLossMode;
  let fleetRequirement: number | undefined;
  let fleetWreck: number | undefined;
  let assault: AssaultPlan | null = null;
  if (lossMode === "low") {
    fleetRequirement = 4500;
    fleetWreck = 80;
  } else if (lossMode === "avg") {
    fleetRequirement = 2500;
    fleetWreck = 160;
  } else if (lossMode === "high") {
    fleetRequirement = 1250;
    fleetWreck = 500;
  } else if (lossMode === "dread") {
    if ((ships[4]?.count ?? 0) > 0) {
      assault = {
        ships: [0, 0, 0, 0, 1],
        region: "gxy_chthonian",
        mission: "chthonian",
      };
    }
  } else if (lossMode === "frigate") {
    const frigatePower = ships[2]?.power ?? 0;
    const totalPower = ships.reduce(
      (sum, ship) =>
        sum + (ship.power >= frigatePower ? ship.power * ship.count : 0),
      0,
    );
    if (totalPower >= 4500) {
      assault = {
        ships: ships.map((ship, index) => (index >= 2 ? ship.count : 0)),
        region: "gxy_chthonian",
        mission: "chthonian",
      };
    }
  }

  if (fleetRequirement === undefined || fleetWreck === undefined) {
    return assault;
  }
  if (input.instinct) fleetWreck /= 2;
  const availableShips = ships.map((ship) => ship.count);
  let powerToReserve = fleetRequirement - fleetWreck;
  for (
    let index = availableShips.length - 1;
    index >= 0 && powerToReserve > 0;
    index--
  ) {
    const ship = ships[index];
    if (ship === undefined) continue;
    const reservedShips = Math.min(
      availableShips[index] ?? 0,
      Math.ceil(powerToReserve / ship.power),
    );
    availableShips[index] = (availableShips[index] ?? 0) - reservedShips;
    powerToReserve -= reservedShips * ship.power;
  }
  if (powerToReserve > 0) return assault;

  const minimumPower = ships[0]?.power ?? 0;
  const sets = availableShips.map((amount, index) => {
    const ship = ships[index];
    if (ship === undefined) return [];
    const maximum =
      Math.min(
        amount,
        Math.floor((fleetWreck + (minimumPower - 0.1)) / ship.power),
      ) + 1;
    return Array.from({ length: maximum }, (_, value) => value);
  });
  for (const set of cartesianProduct(sets)) {
    const powerMissing =
      fleetWreck -
      set.reduce(
        (sum, amount, index) => sum + amount * (ships[index]?.power ?? 0),
        0,
      );
    if (powerMissing <= 0 && powerMissing > minimumPower * -1) {
      const lastShip = set.reduce(
        (previous, value, current) => (value > 0 ? current : previous),
        0,
      );
      return {
        ships: ships.map((ship, index) =>
          index >= lastShip ? ship.count : (set[index] ?? 0),
        ),
        region: "gxy_chthonian",
        mission: "chthonian",
      };
    }
  }
  return assault;
}

function planAlienAssault(
  input: Readonly<FleetInput>,
  ships: readonly MutableShip[],
): AssaultPlan | null {
  if (
    !input.alien2Unlocked ||
    input.alien2KnowledgeMaximum < input.alien2KnowledgeRequired
  ) {
    return null;
  }
  const totalPower = ships.reduce(
    (sum, ship) => sum + ship.power * ship.count,
    0,
  );
  const requiredPower = input.alien2LossMode === "suicide" ? 400 : 650;
  return totalPower >= requiredPower
    ? {
        ships: ships.map((ship) => ship.count),
        region: "gxy_alien2",
        mission: "alien2",
      }
    : null;
}

function assaultDecision(
  input: Readonly<FleetInput>,
  assault: Readonly<AssaultPlan>,
): Readonly<LaunchGalaxyAssaultDecision> {
  const commands: FleetAssignmentCommand[] = [];
  for (const region of input.defenseRegions) {
    for (const ship of GALAXY_SHIP_NAMES) {
      commands.push({
        kind: "remove-ship",
        region: region.name,
        ship,
        count: region.assigned[ship],
      });
    }
  }
  GALAXY_SHIP_NAMES.forEach((ship, index) => {
    commands.push({
      kind: "add-ship",
      region: assault.region,
      ship,
      count: assault.ships[index] ?? 0,
    });
  });
  return Object.freeze({
    kind: "launch-galaxy-assault",
    mission: assault.mission,
    commands: freezeCommands(commands),
  });
}

export function planFleet(
  input: Readonly<FleetInput>,
): Readonly<FleetDecision> | null {
  if (!input.available) return null;
  const ships: MutableShip[] = input.ships.map((ship) => ({
    name: ship.name,
    count: ship.assignedCount,
    builtCount: ship.builtCount,
    power: ship.power,
    cover: 0,
  }));
  const chthonian = planChthonianAssault(input, ships);
  if (chthonian !== null) return assaultDecision(input, chthonian);
  if (!input.chthonianUnlocked || input.chthonianLossMode === "ignore") {
    const alien = planAlienAssault(input, ships);
    if (alien !== null) return assaultDecision(input, alien);
  }

  const reclaimCrew = input.crewReclaim && !input.galaxyAssaultPending;
  if (reclaimCrew) {
    ships.forEach((ship) => {
      ship.count = ship.builtCount;
    });
  }
  const regions: MutableRegion[] = input.regions.map((region) => ({
    ...region,
    current: region.assigned,
    assigned: emptyShipCounts(),
  }));
  const regionsToProtect = regions.filter(
    (region) => region.useful && region.piracy - region.armada > 0,
  );
  const missingDefense = regionsToProtect.map(
    (region) => region.piracy - region.armada,
  );
  const minimumPower = ships[0]?.power ?? 0;
  for (let index = ships.length - 1; index >= 0; index--) {
    const ship = ships[index];
    if (ship === undefined) continue;
    const maximumAllocation = missingDefense.reduce(
      (sum, defense) => sum + Math.floor(defense / ship.power),
      0,
    );
    if (ship.count > maximumAllocation) {
      if (ship.count >= maximumAllocation + missingDefense.length) {
        ship.cover = 0;
      } else {
        const overflows = missingDefense
          .map((defense) => defense % ship.power)
          .sort((left, right) => right - left);
        ship.cover = overflows[ship.count - maximumAllocation - 1] ?? 0;
      }
    } else {
      ship.cover = ship.power - (minimumPower - 0.1);
    }
    if (ship.count >= maximumAllocation) {
      missingDefense.forEach((defense, missingIndex, values) => {
        values[missingIndex] = defense % ship.power;
      });
      if (ship.count > maximumAllocation) {
        missingDefense.sort((left, right) => right - left);
        for (
          let missingIndex = 0;
          missingIndex < ship.count - maximumAllocation;
          missingIndex++
        ) {
          missingDefense[missingIndex] = 0;
        }
      }
    }
  }
  for (const ship of ships) {
    if (ship.count > 0) {
      ship.cover = 0.1;
      break;
    }
  }

  const priorityList = regionsToProtect.sort(
    (left, right) => left.priority - right.priority,
  );
  for (const region of priorityList) {
    let missing = region.piracy - region.armada;
    for (
      let shipIndex = ships.length - 1;
      shipIndex >= 0 && missing > 0;
      shipIndex--
    ) {
      const ship = ships[shipIndex];
      if (ship === undefined || ship.cover > missing) continue;
      let shipsToAssign = Math.min(
        ship.count,
        Math.floor(missing / ship.power),
      );
      if (
        shipsToAssign < ship.count &&
        shipsToAssign * ship.power + ship.cover <= missing
      ) {
        shipsToAssign++;
      }
      region.assigned[ship.name] += shipsToAssign;
      ship.count -= shipsToAssign;
      missing -= shipsToAssign * ship.power;
    }

    if (input.maximumCoverage && missing > 0) {
      let shipIndex = -1;
      while (missing > 0 && ++shipIndex < ships.length) {
        const ship = ships[shipIndex];
        if (ship !== undefined && ship.count > 0) {
          const shipsToAssign = Math.min(
            ship.count,
            Math.ceil(missing / ship.power),
          );
          region.assigned[ship.name] += shipsToAssign;
          ship.count -= shipsToAssign;
          missing -= shipsToAssign * ship.power;
        }
      }
      if (missing > 0) break;
      while (--shipIndex >= 0) {
        const ship = ships[shipIndex];
        if (
          ship !== undefined &&
          region.assigned[ship.name] > 0 &&
          missing + ship.power <= 0
        ) {
          const uselessShips = Math.min(
            region.assigned[ship.name],
            Math.floor((missing / ship.power) * -1),
          );
          if (uselessShips > 0) {
            region.assigned[ship.name] -= uselessShips;
            ship.count += uselessShips;
            missing += uselessShips * ship.power;
          }
        }
      }
    }
  }

  let neededShips: GalaxyShipCounts | null = null;
  if (reclaimCrew) {
    neededShips = Object.freeze(
      Object.fromEntries(
        ships.map((ship) => [ship.name, ship.builtCount - ship.count]),
      ),
    ) as GalaxyShipCounts;
  } else if (input.gorddonSymposiumActive) {
    const gorddon = regions[2];
    if (gorddon === undefined) {
      throw new RangeError("Gorddon region is missing");
    }
    ships.forEach((ship) => {
      gorddon.assigned[ship.name] += ship.count;
    });
  }

  const removals: FleetAssignmentCommand[] = [];
  const additions: FleetAssignmentCommand[] = [];
  for (const region of regions) {
    for (const ship of GALAXY_SHIP_NAMES) {
      const delta = region.assigned[ship] - region.current[ship];
      if (delta < 0) {
        removals.push({
          kind: "remove-ship",
          region: region.name,
          ship,
          count: -delta,
        });
      } else if (delta > 0) {
        additions.push({
          kind: "add-ship",
          region: region.name,
          ship,
          count: delta,
        });
      }
    }
  }
  return Object.freeze({
    kind: "manage-galaxy-fleet",
    clearNeededShips: true,
    neededShips,
    commands: freezeCommands([...removals, ...additions]),
  });
}
