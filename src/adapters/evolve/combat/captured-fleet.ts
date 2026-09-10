/** Captured galaxy-fleet assault path over DeadSpace's `#fleet` and mission controls. */

import {
  GALAXY_SHIP_NAMES,
  planFleet,
  type FleetDecision,
  type FleetInput,
  type GalaxyDefenseRegionInput,
  type GalaxyShipCounts,
  type GalaxyShipInput,
} from "../../../domain/combat/fleet.ts";
import type { CommandExecutionOutcome } from "../../../domain/commands.ts";
import type { FleetExecutor, FleetReader } from "../../../ports/fleet.ts";
import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import { isRecord, readProperty } from "../../validation.ts";

export interface CapturedFleetDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
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

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

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
    fleet === undefined
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
  const input: FleetInput = Object.freeze({
    available: true,
    ships: Object.freeze(ships),
    defenseRegions: defense.regions,
    regions: Object.freeze([]),
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
    crewReclaim: false,
    galaxyAssaultPending: false,
    maximumCoverage: false,
    gorddonSymposiumActive: false,
  });
  const decision = planFleet(input);
  return decision?.kind === "launch-galaxy-assault"
    ? Object.freeze({
        input,
        ...(chthonian === undefined ? {} : { chthonian }),
        ...(alien2 === undefined ? {} : { alien2 }),
      })
    : undefined;
}

function sameDecision(
  expected: Readonly<FleetDecision>,
  actual: Readonly<FleetDecision>,
): boolean {
  return (
    expected.kind === actual.kind &&
    expected.kind === "launch-galaxy-assault" &&
    actual.kind === "launch-galaxy-assault" &&
    expected.mission === actual.mission &&
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
      if (expected === null || !sameDecision(expected, decision))
        return rejected(
          "captured-fleet-decision-invalid",
          "galaxy fleet decision changed",
        );
      if (decision.kind !== "launch-galaxy-assault")
        return rejected(
          "captured-fleet-decision-invalid",
          "galaxy fleet decision is not an assault",
        );
      const mission =
        decision.mission === "chthonian" ? active.chthonian : active.alien2;
      if (mission === undefined)
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
      const result = dependencies.controls.invoke(mission, "action");
      return result.ok
        ? SUCCEEDED
        : stale("captured-fleet-mission-stale", result.detail ?? result.reason);
    },
  });
  return Object.freeze({ reader, executor });
}
