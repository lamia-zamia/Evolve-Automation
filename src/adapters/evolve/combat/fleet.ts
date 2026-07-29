import {
  GALAXY_SHIP_NAMES,
  planFleet,
  type FleetDecision,
  type FleetInput,
  type GalaxyDefenseRegionInput,
  type GalaxyMission,
  type GalaxyShipCounts,
  type GalaxyShipInput,
  type GalaxyShipName,
} from "../../../domain/combat/fleet.ts";
import type { FleetExecutor, FleetReader } from "../../../ports/fleet.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import {
  requireBoolean,
  requireFunction,
  requireNumber,
  requireRecord,
  requireString,
  type UnknownRecord,
} from "../../validation.ts";

export interface FleetAdapterDependencies {
  // TRANSITIONAL: FleetManager remains the narrow bridge to the current
  // Vue-backed galaxy fleet assignment controls. Replace it with the final
  // browser/Evolve adapter when the shared fleet manager is retired.
  readonly getFleetManager: () => unknown;
  readonly getGame: () => unknown;
  readonly getSettings: () => unknown;
  readonly getResources: () => unknown;
  readonly getBuildings: () => unknown;
  readonly getGalaxyRegions: () => unknown;
  readonly guardActive: (setting: string) => unknown;
  readonly galaxyAssaultPending: () => unknown;
}

interface FleetSession {
  readonly manager: UnknownRecord;
  readonly game: UnknownRecord;
  readonly settings: UnknownRecord;
  readonly resources: UnknownRecord;
  readonly buildings: UnknownRecord;
  readonly defense: UnknownRecord;
  readonly input: Readonly<FleetInput>;
  readonly missions: ReadonlyMap<GalaxyMission, UnknownRecord>;
}

interface ShipDefinition {
  readonly name: GalaxyShipName;
  readonly building: string;
}

const SHIP_DEFINITIONS: readonly ShipDefinition[] = Object.freeze([
  { name: "scout_ship", building: "ScoutShip" },
  { name: "corvette_ship", building: "CorvetteShip" },
  { name: "frigate_ship", building: "FrigateShip" },
  { name: "cruiser_ship", building: "CruiserShip" },
  { name: "dreadnought", building: "Dreadnought" },
]);

function emptyCounts(): Record<GalaxyShipName, number> {
  return {
    scout_ship: 0,
    corvette_ship: 0,
    frigate_ship: 0,
    cruiser_ship: 0,
    dreadnought: 0,
  };
}

function isShipName(value: string): value is GalaxyShipName {
  return (GALAXY_SHIP_NAMES as readonly string[]).includes(value);
}

function readDefense(rawDefense: UnknownRecord): {
  readonly regions: readonly GalaxyDefenseRegionInput[];
  readonly totals: GalaxyShipCounts;
} {
  const totals = emptyCounts();
  const regions: GalaxyDefenseRegionInput[] = [];
  for (const [regionName, rawAssigned] of Object.entries(rawDefense)) {
    const assignedRecord = requireRecord(
      rawAssigned,
      `game.global.galaxy.defense.${regionName}`,
    );
    const assigned = emptyCounts();
    for (const [rawShip, rawCount] of Object.entries(assignedRecord)) {
      if (!isShipName(rawShip)) {
        throw new TypeError(`unknown galaxy defense ship: ${rawShip}`);
      }
      const count = Math.floor(
        requireNumber(
          rawCount,
          `game.global.galaxy.defense.${regionName}.${rawShip}`,
        ),
      );
      assigned[rawShip] = count;
      totals[rawShip] += count;
    }
    regions.push(
      Object.freeze({
        name: regionName,
        assigned: Object.freeze(assigned),
      }),
    );
  }
  return Object.freeze({
    regions: Object.freeze(regions),
    totals: Object.freeze(totals),
  });
}

function readShipPower(gateway: UnknownRecord, ship: GalaxyShipName): number {
  const action = requireRecord(
    gateway[ship],
    `game.actions.galaxy.gxy_gateway.${ship}`,
  );
  const shipDefinition = requireRecord(
    action["ship"],
    `game.actions.galaxy.gxy_gateway.${ship}.ship`,
  );
  const rating = requireFunction(
    shipDefinition["rating"],
    `game.actions.galaxy.gxy_gateway.${ship}.ship.rating`,
  );
  return requireNumber(
    Reflect.apply(rating, shipDefinition, []),
    `galaxy ship rating ${ship}`,
  );
}

function readMission(
  buildings: UnknownRecord,
  key: string,
): { readonly building: UnknownRecord; readonly unlocked: boolean } {
  const building = requireRecord(buildings[key], `buildings.${key}`);
  const isUnlocked = requireFunction(
    building["isUnlocked"],
    `buildings.${key}.isUnlocked`,
  );
  return {
    building,
    unlocked: Boolean(Reflect.apply(isUnlocked, building, [])),
  };
}

function commandsMatch(
  expected: Readonly<FleetDecision>,
  actual: Readonly<FleetDecision>,
): boolean {
  if (expected.kind !== actual.kind) return false;
  if (
    expected.kind === "launch-galaxy-assault" &&
    actual.kind === "launch-galaxy-assault" &&
    expected.mission !== actual.mission
  ) {
    return false;
  }
  if (
    expected.kind === "manage-galaxy-fleet" &&
    actual.kind === "manage-galaxy-fleet"
  ) {
    const expectedNeeded = expected.neededShips;
    const actualNeeded = actual.neededShips;
    if ((expectedNeeded === null) !== (actualNeeded === null)) return false;
    if (
      expectedNeeded !== null &&
      actualNeeded !== null &&
      GALAXY_SHIP_NAMES.some(
        (ship) => expectedNeeded[ship] !== actualNeeded[ship],
      )
    ) {
      return false;
    }
  }
  return (
    expected.commands.length === actual.commands.length &&
    expected.commands.every((command, index) => {
      const candidate = actual.commands[index];
      return (
        candidate !== undefined &&
        command.kind === candidate.kind &&
        command.region === candidate.region &&
        command.ship === candidate.ship &&
        command.count === candidate.count
      );
    })
  );
}

function unavailableInput(): FleetInput {
  return Object.freeze({
    available: false,
    ships: Object.freeze([]),
    defenseRegions: Object.freeze([]),
    regions: Object.freeze([]),
    chthonianUnlocked: false,
    chthonianLossMode: "ignore",
    dreadedGuardActive: false,
    instinct: false,
    alien2Unlocked: false,
    alien2KnowledgeMaximum: 0,
    alien2KnowledgeRequired: 0,
    alien2LossMode: "normal",
    crewReclaim: false,
    galaxyAssaultPending: false,
    maximumCoverage: false,
    gorddonSymposiumActive: false,
  });
}

export function createFleetAdapter(dependencies: FleetAdapterDependencies): {
  readonly reader: FleetReader;
  readonly executor: FleetExecutor;
} {
  let session: FleetSession | null = null;

  const reader: FleetReader = Object.freeze({
    read() {
      session = null;
      const manager = requireRecord(
        dependencies.getFleetManager(),
        "FleetManager",
      );
      const game = requireRecord(dependencies.getGame(), "game");
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const resources = requireRecord(dependencies.getResources(), "resources");
      const buildings = requireRecord(dependencies.getBuildings(), "buildings");
      const initFleet = requireFunction(
        manager["initFleet"],
        "FleetManager.initFleet",
      );
      if (!Reflect.apply(initFleet, manager, [])) return unavailableInput();

      const global = requireRecord(game["global"], "game.global");
      const galaxy = requireRecord(global["galaxy"], "game.global.galaxy");
      const defense = requireRecord(
        galaxy["defense"],
        "game.global.galaxy.defense",
      );
      const defenseView = readDefense(defense);
      const actions = requireRecord(game["actions"], "game.actions");
      const galaxyActions = requireRecord(
        actions["galaxy"],
        "game.actions.galaxy",
      );
      const gateway = requireRecord(
        galaxyActions["gxy_gateway"],
        "game.actions.galaxy.gxy_gateway",
      );
      const shipRecords = SHIP_DEFINITIONS.map((definition) => {
        const building = requireRecord(
          buildings[definition.building],
          `buildings.${definition.building}`,
        );
        return Object.freeze({ definition, building });
      });
      const preliminaryShips: GalaxyShipInput[] = shipRecords.map(
        ({ definition }) =>
          Object.freeze({
            name: definition.name,
            assignedCount: defenseView.totals[definition.name],
            builtCount: 0,
            power: readShipPower(gateway, definition.name),
          }),
      );

      const rawRegions = dependencies.getGalaxyRegions();
      if (!Array.isArray(rawRegions)) {
        throw new TypeError("galaxy regions must be an array");
      }
      const baseRegions = rawRegions.map((rawRegion, index) => {
        const region = requireRecord(rawRegion, `galaxy regions[${index}]`);
        const name = requireString(
          region["name"],
          `galaxy regions[${index}].name`,
        );
        const current = defenseView.regions.find(
          (candidate) => candidate.name === name,
        );
        if (current === undefined) {
          throw new TypeError(`galaxy defense region ${name} is missing`);
        }
        return {
          name,
          useful: Boolean(region["useful"]),
          piracy: requireNumber(
            region["piracy"],
            `galaxy regions[${index}].piracy`,
          ),
          armada: requireNumber(
            region["armada"],
            `galaxy regions[${index}].armada`,
          ),
          current,
        };
      });

      const chthonian = readMission(buildings, "ChthonianMission");
      let chthonianLossMode = "ignore";
      let dreadedGuardActive = false;
      if (chthonian.unlocked) {
        chthonianLossMode = requireString(
          settings["fleetChthonianLoses"],
          "settings.fleetChthonianLoses",
        );
        if (chthonianLossMode === "dread") {
          dreadedGuardActive = Boolean(
            dependencies.guardActive("guardDreaded"),
          );
        }
      }
      const considerAlien =
        !chthonian.unlocked || chthonianLossMode === "ignore";
      let alien2Unlocked = false;
      let alien2KnowledgeMaximum = 0;
      let alien2KnowledgeRequired = 0;
      let alien2LossMode = "normal";
      const missions = new Map<GalaxyMission, UnknownRecord>();
      missions.set("chthonian", chthonian.building);
      if (considerAlien) {
        const alien = readMission(buildings, "Alien2Mission");
        missions.set("alien2", alien.building);
        alien2Unlocked = alien.unlocked;
        if (alien2Unlocked) {
          const knowledge = requireRecord(
            resources["Knowledge"],
            "resources.Knowledge",
          );
          alien2KnowledgeMaximum = requireNumber(
            knowledge["maxQuantity"],
            "resources.Knowledge.maxQuantity",
          );
          alien2KnowledgeRequired = requireNumber(
            settings["fleetAlien2Knowledge"],
            "settings.fleetAlien2Knowledge",
          );
          alien2LossMode = requireString(
            settings["fleetAlien2Loses"],
            "settings.fleetAlien2Loses",
          );
        }
      }

      const race = requireRecord(global["race"], "game.global.race");
      const preliminary: FleetInput = Object.freeze({
        available: true,
        ships: Object.freeze(preliminaryShips),
        defenseRegions: defenseView.regions,
        regions: Object.freeze(
          baseRegions.map(({ current, ...region }) =>
            Object.freeze({
              ...region,
              priority: 0,
              assigned: current.assigned,
            }),
          ),
        ),
        chthonianUnlocked: chthonian.unlocked,
        chthonianLossMode,
        dreadedGuardActive,
        instinct: Boolean(race["instinct"]),
        alien2Unlocked,
        alien2KnowledgeMaximum,
        alien2KnowledgeRequired,
        alien2LossMode,
        crewReclaim: false,
        galaxyAssaultPending: false,
        maximumCoverage: false,
        gorddonSymposiumActive: false,
      });
      const preliminaryDecision = planFleet(preliminary);
      let input = preliminary;
      if (preliminaryDecision?.kind !== "launch-galaxy-assault") {
        const crewReclaim = requireBoolean(
          settings["fleetCrewReclaim"],
          "settings.fleetCrewReclaim",
        );
        const assaultPending =
          crewReclaim && Boolean(dependencies.galaxyAssaultPending());
        const reclaimCrew = crewReclaim && !assaultPending;
        const ships = reclaimCrew
          ? preliminaryShips.map((ship, index) => {
              const record = shipRecords[index];
              if (record === undefined) return ship;
              return Object.freeze({
                ...ship,
                builtCount: requireNumber(
                  record.building["count"],
                  `buildings.${record.definition.building}.count`,
                ),
              });
            })
          : preliminaryShips;
        let gorddonSymposiumActive = false;
        if (!reclaimCrew) {
          const symposium = requireRecord(
            buildings["GorddonSymposium"],
            "buildings.GorddonSymposium",
          );
          gorddonSymposiumActive =
            requireNumber(
              symposium["stateOnCount"],
              "buildings.GorddonSymposium.stateOnCount",
            ) > 0;
        }
        input = Object.freeze({
          ...preliminary,
          ships: Object.freeze(ships),
          regions: Object.freeze(
            baseRegions.map(({ current, ...region }) =>
              Object.freeze({
                ...region,
                priority: requireNumber(
                  settings[`fleet_pr_${region.name}`],
                  `settings.fleet_pr_${region.name}`,
                ),
                assigned: current.assigned,
              }),
            ),
          ),
          crewReclaim,
          galaxyAssaultPending: assaultPending,
          maximumCoverage: requireBoolean(
            settings["fleetMaxCover"],
            "settings.fleetMaxCover",
          ),
          gorddonSymposiumActive,
        });
      }
      session = Object.freeze({
        manager,
        game,
        settings,
        resources,
        buildings,
        defense,
        input,
        missions,
      });
      return input;
    },
  });

  const executor: FleetExecutor = Object.freeze({
    execute(decision: Readonly<FleetDecision>) {
      const active = session;
      if (active === null)
        return stale("fleet-session-missing", "fleet session is missing");
      if (
        dependencies.getFleetManager() !== active.manager ||
        dependencies.getGame() !== active.game ||
        dependencies.getSettings() !== active.settings ||
        dependencies.getResources() !== active.resources ||
        dependencies.getBuildings() !== active.buildings
      ) {
        return stale("fleet-source-changed", "fleet source changed");
      }
      const global = requireRecord(active.game["global"], "game.global");
      const galaxy = requireRecord(global["galaxy"], "game.global.galaxy");
      if (galaxy["defense"] !== active.defense) {
        return stale("fleet-defense-changed", "galaxy defense changed");
      }
      const expected = planFleet(active.input);
      if (expected === null || !commandsMatch(expected, decision)) {
        return rejected(
          "invalid-fleet-decision",
          "fleet decision does not match the sampled plan",
        );
      }
      const addShip = requireFunction(
        active.manager["addShip"],
        "FleetManager.addShip",
      );
      const removeShip = requireFunction(
        active.manager["subShip"],
        "FleetManager.subShip",
      );
      let clickMission: (() => unknown) | null = null;
      let mission: UnknownRecord | null = null;
      if (decision.kind === "launch-galaxy-assault") {
        mission = active.missions.get(decision.mission) ?? null;
        if (mission === null) {
          return stale("fleet-mission-changed", "fleet mission changed");
        }
        clickMission = requireFunction(
          mission["click"],
          `buildings.${decision.mission}.click`,
        );
      }
      session = null;
      if (decision.kind === "manage-galaxy-fleet") {
        active.manager["neededShips"] = null;
        if (decision.neededShips !== null) {
          active.manager["neededShips"] = { ...decision.neededShips };
        }
      }
      for (const command of decision.commands) {
        Reflect.apply(
          command.kind === "add-ship" ? addShip : removeShip,
          active.manager,
          [command.region, command.ship, command.count],
        );
      }
      if (clickMission !== null && mission !== null) {
        Reflect.apply(clickMission, mission, []);
      }
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}
