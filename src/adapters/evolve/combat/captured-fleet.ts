/** Captured galaxy-fleet assault path over DeadSpace's `#fleet` and mission controls. */

import {
  GALAXY_SHIP_NAMES,
  type GalaxyRegionInput,
  planFleet,
  type FleetDecision,
  type FleetInput,
  type GalaxyDefenseRegionInput,
  type GalaxyShipCounts,
  type GalaxyShipInput,
} from "../../../domain/combat/fleet.ts";
import {
  decideGalaxyPiracyProtection,
  type GalaxyPiracyResourceId,
} from "../../../domain/combat/galaxy-piracy.ts";
import type { CommandExecutionOutcome } from "../../../domain/commands.ts";
import type { FleetExecutor, FleetReader } from "../../../ports/fleet.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import { finite, isRecord, readProperty } from "../../validation.ts";

export interface CapturedFleetDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readDemand: () => {
    readonly isDemanded: (resourceId: string) => boolean;
  };
}

interface FleetSession {
  readonly root: unknown;
  readonly input: Readonly<FleetInput>;
  readonly fleet: GameControlHandle;
  readonly chthonian: GameControlHandle | undefined;
  readonly alien2: GameControlHandle | undefined;
}

const REGION_NAMES = Object.freeze([
  "gxy_gateway",
  "gxy_stargate",
  "gxy_gorddon",
  "gxy_alien1",
  "gxy_alien2",
  "gxy_chthonian",
]);

const PIRACY_RESOURCES: readonly GalaxyPiracyResourceId[] = Object.freeze([
  "Adamantite",
  "Bolognium",
  "Iridium",
  "Knowledge",
  "Orichalcum",
  "Vitreloy",
]);

const GALAXY_TRADE_BUY_RESOURCES = Object.freeze([
  "Deuterium",
  "Neutronium",
  "Adamantite",
  "Elerium",
  "Nano_Tube",
  "Graphene",
  "Stanene",
  "Bolognium",
  "Vitreloy",
]);

const DEFAULT_PRIORITIES: Readonly<Record<string, number>> = Object.freeze({
  gxy_stargate: 0,
  gxy_alien2: 1,
  gxy_alien1: 2,
  gxy_chthonian: 3,
  gxy_gateway: 4,
  gxy_gorddon: 5,
});

type GalaxyRegionDefinition = Omit<GalaxyRegionInput, "assigned">;

function count(value: unknown): number | undefined {
  const result = finite(value);
  return result !== undefined && Number.isSafeInteger(result) && result >= 0
    ? result
    : undefined;
}

function emptyCounts(): Record<(typeof GALAXY_SHIP_NAMES)[number], number> {
  return Object.fromEntries(
    GALAXY_SHIP_NAMES.map((name) => [name, 0]),
  ) as Record<(typeof GALAXY_SHIP_NAMES)[number], number>;
}

function settingBoolean(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  return typeof settings[key] === "boolean" ? settings[key] : fallback;
}

function settingNumber(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: number,
): number {
  return finite(settings[key]) ?? fallback;
}

function activeCount(galaxy: Record<PropertyKey, unknown>, id: string): number {
  return count(readProperty(readProperty(galaxy, id), "on")) ?? 0;
}

function resourceIsUseful(
  root: unknown,
  settings: Record<PropertyKey, unknown>,
  demanded: (resourceId: string) => boolean,
  resourceId: string,
): boolean {
  const resource = readProperty(readProperty(root, "resource"), resourceId);
  if (!isRecord(resource)) return false;
  const amount = finite(resource["amount"]);
  const maximum = finite(resource["max"]);
  if (amount === undefined || maximum === undefined) return false;
  const ratio = maximum > 0 ? amount / maximum : 1;
  const maxStorage = finite(settings[`res_max_store${resourceId}`]);
  return (
    ratio < 0.99 ||
    demanded(resourceId) ||
    (settings[`res_storage_o_${resourceId}`] === true &&
      maxStorage !== undefined &&
      amount < maxStorage)
  );
}

function tradeTargetsUsefulResource(
  root: unknown,
  usefulResources: Readonly<Record<GalaxyPiracyResourceId, boolean>>,
): boolean {
  const trade = readProperty(readProperty(root, "galaxy"), "trade");
  if (!isRecord(trade)) return false;
  return GALAXY_TRADE_BUY_RESOURCES.some((resourceId, index) => {
    const routes = count(trade[`f${index}`]);
    return (
      routes !== undefined &&
      routes > 0 &&
      resourceIsGalaxyResource(usefulResources, resourceId)
    );
  });
}

function resourceIsGalaxyResource(
  usefulResources: Readonly<Record<GalaxyPiracyResourceId, boolean>>,
  resourceId: string,
): boolean {
  return (
    resourceId in usefulResources &&
    usefulResources[resourceId as GalaxyPiracyResourceId] === true
  );
}

function readAuxiliaryShipPower(
  id: "armed_miner" | "minelayer" | "raider",
  race: Record<PropertyKey, unknown>,
): number {
  const banana = race["banana"] === true;
  const wish =
    race["wish"] === true &&
    isRecord(race["wishStats"]) &&
    readProperty(race["wishStats"], "ship") === true;
  const base =
    id === "armed_miner"
      ? banana
        ? 4
        : 5
      : id === "minelayer"
        ? banana
          ? 35
          : 50
        : banana
          ? 9
          : 12;
  const bonus =
    id === "armed_miner"
      ? banana
        ? 2
        : 5
      : id === "minelayer"
        ? banana
          ? 15
          : 25
        : banana
          ? 3
          : 6;
  return base + (wish ? bonus : 0);
}

function readGalaxyRegions(
  root: unknown,
  race: Record<PropertyKey, unknown>,
  galaxy: Record<PropertyKey, unknown>,
  settings: Record<PropertyKey, unknown>,
  demand: (resourceId: string) => boolean,
  piracy: number,
): readonly GalaxyRegionDefinition[] | undefined {
  // DeadSpace's trait helpers are not part of the captured root. Do not silently use the
  // unmodified piracy value for chicken or ocular-power races until those modifiers are captured.
  if (
    race["chicken"] === true ||
    (race["ocular_power"] === true &&
      isRecord(race["ocularPowerConfig"]) &&
      readProperty(race["ocularPowerConfig"], "f") === true)
  ) {
    return undefined;
  }
  const usefulResources = Object.fromEntries(
    PIRACY_RESOURCES.map((resourceId) => [
      resourceId,
      resourceIsUseful(root, settings, demand, resourceId),
    ]),
  ) as Record<GalaxyPiracyResourceId, boolean>;
  const protection = decideGalaxyPiracyProtection({
    producers: {
      bologniumShip: activeCount(galaxy, "bolognium_ship") > 0,
      gorddonSymposium: activeCount(galaxy, "symposium") > 0,
      alien1VitreloyPlant: activeCount(galaxy, "vitreloy_plant") > 0,
      alien2ArmedMiner: activeCount(galaxy, "armed_miner") > 0,
      alien2Scavenger: activeCount(galaxy, "scavenger") > 0,
      chthonianExcavator: activeCount(galaxy, "excavator") > 0,
    },
    usefulResources,
    gorddonTradeTargetsUsefulResource: tradeTargetsUsefulResource(
      root,
      usefulResources,
    ),
  });
  const instinct = race["instinct"] === true;
  const armedMinerPower = readAuxiliaryShipPower("armed_miner", race);
  const minelayerPower = readAuxiliaryShipPower("minelayer", race);
  const raiderPower = readAuxiliaryShipPower("raider", race);
  const multiplier = instinct ? 0.9 : 1;
  return Object.freeze([
    Object.freeze({
      name: "gxy_stargate",
      piracy: 0.1 * piracy * multiplier,
      armada: activeCount(galaxy, "defense_platform") * 20,
      useful: protection.gxy_stargate,
      priority: settingNumber(
        settings,
        "fleet_pr_gxy_stargate",
        DEFAULT_PRIORITIES.gxy_stargate ?? 0,
      ),
    }),
    Object.freeze({
      name: "gxy_gateway",
      piracy: 0.1 * piracy * multiplier,
      armada: activeCount(galaxy, "starbase") * 25,
      useful: protection.gxy_gateway,
      priority: settingNumber(
        settings,
        "fleet_pr_gxy_gateway",
        DEFAULT_PRIORITIES.gxy_gateway ?? 0,
      ),
    }),
    Object.freeze({
      name: "gxy_gorddon",
      piracy: instinct ? 720 : 800,
      armada: 0,
      useful: protection.gxy_gorddon,
      priority: settingNumber(
        settings,
        "fleet_pr_gxy_gorddon",
        DEFAULT_PRIORITIES.gxy_gorddon ?? 0,
      ),
    }),
    Object.freeze({
      name: "gxy_alien1",
      piracy: instinct ? 900 : 1000,
      armada: 0,
      useful: protection.gxy_alien1,
      priority: settingNumber(
        settings,
        "fleet_pr_gxy_alien1",
        DEFAULT_PRIORITIES.gxy_alien1 ?? 0,
      ),
    }),
    Object.freeze({
      name: "gxy_alien2",
      piracy: instinct ? 2250 : 2500,
      armada:
        activeCount(galaxy, "foothold") * 50 +
        activeCount(galaxy, "armed_miner") * armedMinerPower,
      useful: protection.gxy_alien2,
      priority: settingNumber(
        settings,
        "fleet_pr_gxy_alien2",
        DEFAULT_PRIORITIES.gxy_alien2 ?? 0,
      ),
    }),
    Object.freeze({
      name: "gxy_chthonian",
      piracy: instinct ? 7000 : 7500,
      armada:
        activeCount(galaxy, "minelayer") * minelayerPower +
        activeCount(galaxy, "raider") * raiderPower,
      useful: protection.gxy_chthonian,
      priority: settingNumber(
        settings,
        "fleet_pr_gxy_chthonian",
        DEFAULT_PRIORITIES.gxy_chthonian ?? 0,
      ),
    }),
  ]);
}

function readShipPower(
  name: (typeof GALAXY_SHIP_NAMES)[number],
  race: Record<PropertyKey, unknown>,
): number {
  const banana = race["banana"] === true;
  const wish =
    race["wish"] === true &&
    isRecord(race["wishStats"]) &&
    readProperty(race["wishStats"], "ship") === true;
  const base: Record<string, number> = {
    scout_ship: banana ? 7 : 10,
    corvette_ship: banana ? 21 : 30,
    frigate_ship: banana ? 56 : 80,
    cruiser_ship: banana ? 175 : 250,
    dreadnought: banana ? 1260 : 1800,
  };
  const wishBonus: Record<string, number> = {
    scout_ship: banana ? 1 : 5,
    corvette_ship: banana ? 4 : 10,
    frigate_ship: banana ? 14 : 20,
    cruiser_ship: banana ? 25 : 50,
    dreadnought: banana ? 140 : 200,
  };
  const result = (base[name] ?? 0) + (wish ? (wishBonus[name] ?? 0) : 0);
  return result;
}

function readDefense(root: unknown):
  | {
      readonly regions: readonly GalaxyDefenseRegionInput[];
      readonly totals: GalaxyShipCounts;
    }
  | undefined {
  const defense = readProperty(readProperty(root, "galaxy"), "defense");
  if (!isRecord(defense)) return undefined;
  const totals = emptyCounts();
  const regions: GalaxyDefenseRegionInput[] = [];
  for (const regionName of REGION_NAMES) {
    const rawRegion = readProperty(defense, regionName);
    if (!isRecord(rawRegion)) return undefined;
    const assigned = emptyCounts();
    for (const ship of GALAXY_SHIP_NAMES) {
      const shipCount = count(rawRegion[ship]);
      if (shipCount === undefined) return undefined;
      assigned[ship] = shipCount;
      totals[ship] += shipCount;
    }
    regions.push(
      Object.freeze({ name: regionName, assigned: Object.freeze(assigned) }),
    );
  }
  return Object.freeze({
    regions: Object.freeze(regions),
    totals: Object.freeze(totals),
  });
}

function readInput(
  root: unknown,
  settingsValue: unknown,
  controls: GameControlRegistry,
  readDemand: CapturedFleetDependencies["readDemand"],
):
  | {
      readonly input: Readonly<FleetInput>;
      readonly chthonian?: GameControlHandle;
      readonly alien2?: GameControlHandle;
    }
  | undefined {
  const race = readProperty(root, "race");
  const tech = readProperty(root, "tech");
  const galaxy = readProperty(root, "galaxy");
  const settings = isRecord(settingsValue) ? settingsValue : {};
  if (
    !isRecord(race) ||
    !isRecord(tech) ||
    !isRecord(galaxy) ||
    race["truepath"] === true
  )
    return undefined;
  const piracy = finite(tech["piracy"]);
  const defense = readDefense(root);
  const fleet = controls.resolve("fleet");
  if (
    piracy === undefined ||
    piracy <= 0 ||
    defense === undefined ||
    fleet === undefined ||
    !fleet.methods.includes("add") ||
    !fleet.methods.includes("sub")
  )
    return undefined;

  const ships: GalaxyShipInput[] = [];
  for (const name of GALAXY_SHIP_NAMES) {
    const builtCount = count(readProperty(readProperty(galaxy, name), "count"));
    if (builtCount === undefined) return undefined;
    ships.push(
      Object.freeze({
        name,
        assignedCount: defense.totals[name],
        builtCount,
        power: readShipPower(name, race),
      }),
    );
  }
  const chthonian = controls.resolve("galaxy-chthonian_mission");
  const alien2 = controls.resolve("galaxy-alien2_mission");
  const regions = readGalaxyRegions(
    root,
    race,
    galaxy,
    settings,
    readDemand().isDemanded,
    piracy,
  );
  if (regions === undefined) return undefined;
  const chthonianLossMode =
    typeof settings["fleetChthonianLoses"] === "string"
      ? settings["fleetChthonianLoses"]
      : "ignore";
  const knowledgeMaximum =
    finite(
      readProperty(
        readProperty(readProperty(root, "resource"), "Knowledge"),
        "max",
      ),
    ) ?? 0;
  const galaxyAssaultPending =
    (chthonian !== undefined && chthonianLossMode !== "ignore") ||
    alien2 !== undefined;
  const regionInputs = regions.map((region, index) =>
    Object.freeze({
      ...region,
      assigned: defense.regions[index]?.assigned ?? emptyCounts(),
    }),
  );
  const input: FleetInput = Object.freeze({
    available: true,
    ships: Object.freeze(ships),
    defenseRegions: defense.regions,
    regions: Object.freeze(regionInputs),
    chthonianUnlocked: chthonian !== undefined,
    chthonianLossMode,
    dreadedGuardActive: false,
    instinct: race["instinct"] === true,
    alien2Unlocked: alien2 !== undefined,
    alien2KnowledgeMaximum: knowledgeMaximum,
    alien2KnowledgeRequired:
      finite(settings["fleetAlien2Knowledge"]) ?? 8000000,
    alien2LossMode:
      typeof settings["fleetAlien2Loses"] === "string"
        ? settings["fleetAlien2Loses"]
        : "normal",
    crewReclaim: settingBoolean(settings, "fleetCrewReclaim", true),
    galaxyAssaultPending,
    maximumCoverage: settingBoolean(settings, "fleetMaxCover", true),
    gorddonSymposiumActive: activeCount(galaxy, "symposium") > 0,
  });
  const decision = planFleet(input);
  if (decision === null) return undefined;
  return Object.freeze({
    input,
    ...(chthonian === undefined ? {} : { chthonian }),
    ...(alien2 === undefined ? {} : { alien2 }),
  });
}

function sameDecision(
  expected: Readonly<FleetDecision>,
  actual: Readonly<FleetDecision>,
): boolean {
  if (expected.kind !== actual.kind) return false;
  if (
    expected.commands.length !== actual.commands.length ||
    !expected.commands.every((command, index) => {
      const candidate = actual.commands[index];
      return (
        candidate !== undefined &&
        command.kind === candidate.kind &&
        command.region === candidate.region &&
        command.ship === candidate.ship &&
        command.count === candidate.count
      );
    })
  ) {
    return false;
  }
  if (expected.kind === "launch-galaxy-assault") {
    return (
      actual.kind === "launch-galaxy-assault" &&
      expected.mission === actual.mission
    );
  }
  if (actual.kind !== "manage-galaxy-fleet") return false;
  return expected.neededShips === null
    ? actual.neededShips === null
    : actual.neededShips !== null &&
        GALAXY_SHIP_NAMES.every(
          (ship) => expected.neededShips?.[ship] === actual.neededShips?.[ship],
        );
}

export function createCapturedFleetAutomation(
  dependencies: CapturedFleetDependencies,
): { readonly reader: FleetReader; readonly executor: FleetExecutor } {
  let session: FleetSession | null = null;
  const reader: FleetReader = Object.freeze({
    read(): FleetInput {
      session = null;
      const sample = readInput(
        dependencies.rootState.readRoot(),
        dependencies.readSettings(),
        dependencies.controls,
        dependencies.readDemand,
      );
      if (sample === undefined)
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
      const fleet = dependencies.controls.resolve("fleet");
      if (fleet === undefined)
        return Object.freeze({ ...sample.input, available: false });
      session = Object.freeze({
        root: dependencies.rootState.readRoot(),
        input: sample.input,
        fleet,
        chthonian: sample.chthonian,
        alien2: sample.alien2,
      });
      return sample.input;
    },
  });
  const executor: FleetExecutor = Object.freeze({
    execute(decision: Readonly<FleetDecision>): CommandExecutionOutcome {
      const active = session;
      if (active === null)
        return stale(
          "captured-fleet-session-missing",
          "galaxy fleet session is missing",
        );
      if (dependencies.rootState.readRoot() !== active.root)
        return stale(
          "captured-fleet-source-changed",
          "galaxy fleet root changed",
        );
      const expected = planFleet(active.input);
      const current = readInput(
        active.root,
        dependencies.readSettings(),
        dependencies.controls,
        dependencies.readDemand,
      );
      const currentDecision =
        current === undefined ? null : planFleet(current.input);
      if (
        expected === null ||
        currentDecision === null ||
        currentDecision === undefined ||
        !sameDecision(expected, decision) ||
        !sameDecision(currentDecision, decision)
      )
        return rejected(
          "captured-fleet-decision-invalid",
          "galaxy fleet decision changed",
        );
      const mission =
        decision.kind === "launch-galaxy-assault"
          ? decision.mission === "chthonian"
            ? active.chthonian
            : active.alien2
          : undefined;
      if (decision.kind === "launch-galaxy-assault" && mission === undefined)
        return stale(
          "captured-fleet-mission-missing",
          "galaxy assault mission is no longer captured",
        );
      session = null;
      for (const command of decision.commands) {
        const method = command.kind === "add-ship" ? "add" : "sub";
        for (let index = 0; index < command.count; index++) {
          const result = dependencies.controls.invoke(active.fleet, method, [
            command.region,
            command.ship,
          ]);
          if (!result.ok)
            return stale(
              "captured-fleet-control-stale",
              `${method}: ${result.detail ?? result.reason}`,
            );
        }
      }
      if (mission === undefined) return SUCCEEDED;
      const result = dependencies.controls.invoke(mission, "action");
      return result.ok
        ? SUCCEEDED
        : stale("captured-fleet-mission-stale", result.detail ?? result.reason);
    },
  });
  return Object.freeze({ reader, executor });
}
