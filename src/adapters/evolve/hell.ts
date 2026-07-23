import {
  calculateHellBaseTargets,
  planHell,
  prepareHellCycle,
  type HellAdjustmentCommand,
  type HellCalculationInput,
  type HellCycleInput,
  type HellDecision,
  type HellManageDecision,
  type HellTargetRequest,
} from "../../domain/combat/hell.ts";
import type { HellExecutor, HellReader } from "../../ports/hell.ts";
import { rejected, stale, SUCCEEDED } from "../command-outcomes.ts";
import {
  requireBoolean,
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

export interface HellAdapterDependencies {
  // TRANSITIONAL: WarManager remains the narrow bridge to the current
  // Vue-backed garrison and Hell fortress controls. Replace it with the final
  // browser/Evolve command adapters when the shared manager is retired.
  readonly getWarManager: () => unknown;
  readonly getGame: () => unknown;
  readonly getSettings: () => unknown;
  readonly getBuildings: () => unknown;
  readonly getResources: () => unknown;
  readonly getState: () => unknown;
  readonly getDebugWindow: () => unknown;
  readonly debugLog: (message: string) => void;
}

interface HellSession {
  readonly manager: UnknownRecord;
  readonly game: UnknownRecord;
  readonly settings: UnknownRecord;
  readonly buildings: UnknownRecord;
  readonly resources: UnknownRecord;
  readonly state: UnknownRecord;
  readonly debugWindow: UnknownRecord;
  readonly cycleInput: Readonly<HellCycleInput>;
  calculation: Readonly<HellCalculationInput> | null;
  request: Readonly<HellTargetRequest> | null;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

function optionalNumber(value: unknown, path: string): number {
  return value === undefined ? 0 : requireNumber(value, path);
}

function requireSoldierTarget(value: unknown, path: string): number {
  // The current game calculator returns positive infinity when Authority makes
  // one soldier's attack rating zero. Treat that as an unreachable target;
  // the pure policy clamps it to the available contingent exactly as legacy did.
  if (value === Number.POSITIVE_INFINITY) return Number.MAX_SAFE_INTEGER;
  return requireNumber(value, path);
}

function call(
  target: UnknownRecord,
  key: string,
  path: string,
  args: readonly unknown[] = [],
): unknown {
  return Reflect.apply(requireFunction(target[key], path), target, args);
}

function unavailableInput(): Readonly<HellCycleInput> {
  return Object.freeze({
    available: false,
    warlord: false,
    enemies: 0,
    minions: 0,
    handleEnemyFortress: false,
    minimumMinions: 0,
    maximumSoldiers: 0,
    currentSoldiers: 0,
    currentCityGarrison: 0,
    maximumCityGarrison: 0,
    hellSoldiers: 0,
    hellPatrols: 0,
    hellPatrolSize: 0,
    hellAssigned: 0,
    hellReservedSoldiers: 0,
    currentHellGarrison: 0,
    homeGarrison: 0,
    minimumHellSoldiers: 0,
    minimumSoldierPercent: 0,
    elysiumUnlocked: false,
    fortressWalls: 0,
    fortressThreat: 0,
    lowWallsMultiplier: 0,
    targetFortressDamage: 1,
    turretCount: 0,
    turretTechnology: 0,
    handlePatrolSize: false,
    patrolThreatPercent: 0,
    patrolDroneModifier: 0,
    patrolDroidModifier: 0,
    patrolBootcampModifier: 0,
    minimumPatrolRating: 0,
    bolsterPatrolRating: 0,
    bolsterPercentTop: 0,
    bolsterPercentBottom: 0,
    warDroneCount: 0,
    portalTechnology: 0,
    warDroidCount: 0,
    hellDroidTechnology: false,
    bootCampCount: 0,
    manageAuthority: false,
    minimumAuthority: 0,
    minimumAuthorityPatrolPercent: 0,
    evilTechnology: 0,
    grenadier: false,
    government: "",
  });
}

function decisionsMatch(
  left: Readonly<HellDecision>,
  right: Readonly<HellDecision>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readUnlocked(building: UnknownRecord, path: string): boolean {
  return Boolean(call(building, "isUnlocked", `${path}.isUnlocked`));
}

export function createHellAdapter(dependencies: HellAdapterDependencies): {
  readonly reader: HellReader;
  readonly executor: HellExecutor;
} {
  let session: HellSession | null = null;

  const reader: HellReader = Object.freeze({
    readCycle() {
      session = null;
      const manager = requireRecord(dependencies.getWarManager(), "WarManager");
      const game = requireRecord(dependencies.getGame(), "game");
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const buildings = requireRecord(dependencies.getBuildings(), "buildings");
      const resources = requireRecord(dependencies.getResources(), "resources");
      const state = requireRecord(dependencies.getState(), "state");
      const debugWindow = requireRecord(
        dependencies.getDebugWindow(),
        "debug window",
      );
      if (!manager["_garrisonVue"] || !manager["_hellVue"]) {
        return unavailableInput();
      }

      const global = requireRecord(game["global"], "game.global");
      const race = requireRecord(global["race"], "game.global.race");
      const warlord = Boolean(race["warlord"]);
      if (warlord) {
        const input = Object.freeze({
          ...unavailableInput(),
          available: true,
          warlord: true,
          enemies: requireNumber(manager["enemies"], "WarManager.enemies"),
          minions: requireNumber(manager["minions"], "WarManager.minions"),
          handleEnemyFortress: requireBoolean(
            settings["warlordHandleFortress"],
            "settings.warlordHandleFortress",
          ),
          minimumMinions: requireNumber(
            settings["warlordMinimumMinions"],
            "settings.warlordMinimumMinions",
          ),
        });
        session = {
          manager,
          game,
          settings,
          buildings,
          resources,
          state,
          debugWindow,
          cycleInput: input,
          calculation: null,
          request: null,
        };
        return input;
      }

      const portal = requireRecord(global["portal"], "game.global.portal");
      const fortress = requireRecord(
        portal["fortress"],
        "game.global.portal.fortress",
      );
      const tech = requireRecord(global["tech"], "game.global.tech");
      const city = requireRecord(global["city"], "game.global.city");
      const civic = requireRecord(global["civic"], "game.global.civic");
      const govern = requireRecord(civic["govern"], "game.global.civic.govern");
      const elysiumFortress = requireRecord(
        buildings["ElysiumFortress"],
        "buildings.ElysiumFortress",
      );
      let elysiumUnlocked = readUnlocked(
        elysiumFortress,
        "buildings.ElysiumFortress",
      );
      if (!elysiumUnlocked) {
        elysiumUnlocked = readUnlocked(
          requireRecord(buildings["ElysiumScout"], "buildings.ElysiumScout"),
          "buildings.ElysiumScout",
        );
      }
      const warDrone = portal["war_drone"]
        ? requireRecord(portal["war_drone"], "game.global.portal.war_drone")
        : null;
      const warDroid = portal["war_droid"]
        ? requireRecord(portal["war_droid"], "game.global.portal.war_droid")
        : null;
      const bootCamp = city["boot_camp"]
        ? requireRecord(city["boot_camp"], "game.global.city.boot_camp")
        : null;
      const turret = requireRecord(
        buildings["PortalTurret"],
        "buildings.PortalTurret",
      );
      const input = Object.freeze({
        available: true,
        warlord: false,
        enemies: 0,
        minions: 0,
        handleEnemyFortress: false,
        minimumMinions: 0,
        maximumSoldiers: requireNumber(
          manager["maxSoldiers"],
          "WarManager.maxSoldiers",
        ),
        currentSoldiers: requireNumber(
          manager["currentSoldiers"],
          "WarManager.currentSoldiers",
        ),
        currentCityGarrison: requireNumber(
          manager["currentCityGarrison"],
          "WarManager.currentCityGarrison",
        ),
        maximumCityGarrison: requireNumber(
          manager["maxCityGarrison"],
          "WarManager.maxCityGarrison",
        ),
        hellSoldiers: requireNumber(
          manager["hellSoldiers"],
          "WarManager.hellSoldiers",
        ),
        hellPatrols: requireNumber(
          manager["hellPatrols"],
          "WarManager.hellPatrols",
        ),
        hellPatrolSize: requireNumber(
          manager["hellPatrolSize"],
          "WarManager.hellPatrolSize",
        ),
        // A freshly unlocked fortress has no `assigned` property until the game
        // first writes it; treat the absent value as zero as legacy did.
        hellAssigned: optionalNumber(
          manager["hellAssigned"],
          "WarManager.hellAssigned",
        ),
        hellReservedSoldiers: requireNumber(
          manager["hellReservedSoldiers"],
          "WarManager.hellReservedSoldiers",
        ),
        currentHellGarrison: requireNumber(
          manager["hellGarrison"],
          "WarManager.hellGarrison",
        ),
        homeGarrison: requireNumber(
          settings["hellHomeGarrison"],
          "settings.hellHomeGarrison",
        ),
        minimumHellSoldiers: requireNumber(
          settings["hellMinSoldiers"],
          "settings.hellMinSoldiers",
        ),
        minimumSoldierPercent: requireNumber(
          settings["hellMinSoldiersPercent"],
          "settings.hellMinSoldiersPercent",
        ),
        elysiumUnlocked,
        fortressWalls: requireNumber(
          fortress["walls"],
          "game.global.portal.fortress.walls",
        ),
        fortressThreat: requireNumber(
          fortress["threat"],
          "game.global.portal.fortress.threat",
        ),
        lowWallsMultiplier: requireNumber(
          settings["hellLowWallsMulti"],
          "settings.hellLowWallsMulti",
        ),
        targetFortressDamage: requireNumber(
          settings["hellTargetFortressDamage"],
          "settings.hellTargetFortressDamage",
        ),
        turretCount: requireNumber(
          turret["stateOnCount"],
          "buildings.PortalTurret.stateOnCount",
        ),
        turretTechnology: optionalNumber(
          tech["turret"],
          "game.global.tech.turret",
        ),
        handlePatrolSize: requireBoolean(
          settings["hellHandlePatrolSize"],
          "settings.hellHandlePatrolSize",
        ),
        patrolThreatPercent: requireNumber(
          settings["hellPatrolThreatPercent"],
          "settings.hellPatrolThreatPercent",
        ),
        patrolDroneModifier: requireNumber(
          settings["hellPatrolDroneMod"],
          "settings.hellPatrolDroneMod",
        ),
        patrolDroidModifier: requireNumber(
          settings["hellPatrolDroidMod"],
          "settings.hellPatrolDroidMod",
        ),
        patrolBootcampModifier: requireNumber(
          settings["hellPatrolBootcampMod"],
          "settings.hellPatrolBootcampMod",
        ),
        minimumPatrolRating: requireNumber(
          settings["hellPatrolMinRating"],
          "settings.hellPatrolMinRating",
        ),
        bolsterPatrolRating: requireNumber(
          settings["hellBolsterPatrolRating"],
          "settings.hellBolsterPatrolRating",
        ),
        bolsterPercentTop: requireNumber(
          settings["hellBolsterPatrolPercentTop"],
          "settings.hellBolsterPatrolPercentTop",
        ),
        bolsterPercentBottom: requireNumber(
          settings["hellBolsterPatrolPercentBottom"],
          "settings.hellBolsterPatrolPercentBottom",
        ),
        warDroneCount:
          warDrone === null
            ? 0
            : requireNumber(warDrone["on"], "game.global.portal.war_drone.on"),
        portalTechnology:
          warDrone === null
            ? 0
            : requireNumber(tech["portal"], "game.global.tech.portal"),
        warDroidCount:
          warDroid === null
            ? 0
            : requireNumber(warDroid["on"], "game.global.portal.war_droid.on"),
        hellDroidTechnology: Boolean(tech["hdroid"]),
        bootCampCount:
          bootCamp === null
            ? 0
            : requireNumber(
                bootCamp["count"],
                "game.global.city.boot_camp.count",
              ),
        manageAuthority: requireBoolean(
          settings["authorityManage"],
          "settings.authorityManage",
        ),
        minimumAuthority: requireNumber(
          settings["generalMinimumAuthority"],
          "settings.generalMinimumAuthority",
        ),
        minimumAuthorityPatrolPercent: requireNumber(
          settings["generalAuthorityMinPatrolPercent"],
          "settings.generalAuthorityMinPatrolPercent",
        ),
        evilTechnology: optionalNumber(tech["evil"], "game.global.tech.evil"),
        grenadier: Boolean(race["grenadier"]),
        government: requireString(
          govern["type"],
          "game.global.civic.govern.type",
        ),
      });
      session = {
        manager,
        game,
        settings,
        buildings,
        resources,
        state,
        debugWindow,
        cycleInput: input,
        calculation: null,
        request: null,
      };
      return input;
    },

    readCalculation(request: Readonly<HellTargetRequest>) {
      const active = session;
      if (active === null) throw new Error("Hell cycle has not been sampled");
      const expected = prepareHellCycle(active.cycleInput);
      if (
        expected === null ||
        expected.kind !== "calculate-hell-targets" ||
        JSON.stringify(expected) !== JSON.stringify(request)
      ) {
        throw new Error("Hell target request does not match the sampled plan");
      }
      const garrisonSoldiers = requireSoldierTarget(
        call(
          active.manager,
          "getSoldiersForAttackRating",
          "WarManager.getSoldiersForAttackRating",
          [request.garrisonRating],
        ),
        "Hell garrison soldier target",
      );
      const patrolSoldiers =
        request.patrolRating === null
          ? request.input.hellPatrolSize
          : requireSoldierTarget(
              call(
                active.manager,
                "getSoldiersForAttackRating",
                "WarManager.getSoldiersForAttackRating",
                [request.patrolRating],
              ),
              "Hell patrol soldier target",
            );
      const base = calculateHellBaseTargets(request, {
        garrisonSoldiers,
        patrolSoldiers,
      });
      let unlocked = false;
      let current = 0;
      let maximum = 0;
      let scriptTick = 0;
      let debugEnabled = false;
      if (
        request.input.manageAuthority &&
        request.input.minimumAuthority !== 0 &&
        base.patrolSize > 0
      ) {
        const authority = requireRecord(
          active.resources["Authority"],
          "resources.Authority",
        );
        unlocked = Boolean(
          call(authority, "isUnlocked", "resources.Authority.isUnlocked"),
        );
        if (unlocked) {
          current = requireNumber(
            authority["currentQuantity"],
            "resources.Authority.currentQuantity",
          );
          maximum = requireNumber(
            authority["maxQuantity"],
            "resources.Authority.maxQuantity",
          );
          scriptTick = requireNumber(
            active.state["scriptTick"],
            "state.scriptTick",
          );
          debugEnabled = Boolean(active.debugWindow["authorityDebug"]);
        }
      }
      const calculation = Object.freeze({
        garrisonSoldiers,
        patrolSoldiers,
        authority: Object.freeze({
          unlocked,
          current,
          maximum,
          scriptTick,
          debugEnabled,
        }),
      });
      active.request = request;
      active.calculation = calculation;
      return calculation;
    },
  });

  const executor: HellExecutor = Object.freeze({
    execute(decision: Readonly<HellDecision>) {
      const active = session;
      if (active === null) {
        return stale("hell-session-missing", "Hell session is missing");
      }
      if (
        dependencies.getWarManager() !== active.manager ||
        dependencies.getGame() !== active.game
      ) {
        return stale("hell-source-changed", "Hell source changed");
      }
      const prepared = prepareHellCycle(active.cycleInput);
      let expected: Readonly<HellDecision> | null = null;
      if (prepared !== null && prepared.kind === "calculate-hell-targets") {
        if (active.calculation === null || active.request === null) {
          return stale(
            "hell-calculation-missing",
            "Hell calculation is missing",
          );
        }
        expected = planHell(active.request, active.calculation);
      } else if (
        prepared !== null &&
        (prepared.kind === "manage-hell" ||
          prepared.kind === "attack-enemy-fortress")
      ) {
        expected = prepared;
      }
      if (expected === null || !decisionsMatch(expected, decision)) {
        return rejected(
          "invalid-hell-decision",
          "Hell decision does not match the sampled plan",
        );
      }

      if (decision.kind === "attack-enemy-fortress") {
        const attack = requireFunction(
          active.manager["attackEnemyFortress"],
          "WarManager.attackEnemyFortress",
        );
        session = null;
        Reflect.apply(attack, active.manager, [decision.enemyIndex]);
        return SUCCEEDED;
      }

      const methods = new Map<string, (...args: unknown[]) => unknown>();
      for (const command of decision.commands) {
        requireNumber(command.count, `Hell ${command.kind} count`);
        const methodName = commandMethod(command);
        if (!methods.has(methodName)) {
          methods.set(
            methodName,
            requireFunction(
              active.manager[methodName],
              `WarManager.${methodName}`,
            ),
          );
        }
      }
      const manageDecision = decision as Readonly<HellManageDecision>;
      session = null;
      if (manageDecision.authorityDebug !== null) {
        const debug = manageDecision.authorityDebug;
        dependencies.debugLog(
          `[authority] amount=${debug.amount.toFixed(1)}/${debug.target.toFixed(0)}, perSoldier=${debug.perSoldier.toFixed(2)}, stationed=${debug.currentStationed}→need=${debug.neededStationed}, garrison ${debug.defenseGarrison}→${debug.authorityGarrison} (cap=${debug.maximumStationed}, patrolReserve=${debug.patrolReserve}, patrolSize=${debug.patrolSize}, avail=${debug.availableSoldiers})`,
        );
      }
      if (manageDecision.authorityAdjusted) {
        const calculation = active.calculation;
        if (calculation === null) {
          return stale(
            "hell-calculation-missing",
            "Hell calculation is missing",
          );
        }
        active.state["authoritySoldiersAdjustedTick"] =
          calculation.authority.scriptTick;
      }
      for (const command of manageDecision.commands) {
        const methodName = commandMethod(command);
        Reflect.apply(methods.get(methodName)!, active.manager, [
          command.count,
        ]);
      }
      return SUCCEEDED;
    },
  });

  return Object.freeze({ reader, executor });
}

function commandMethod(command: Readonly<HellAdjustmentCommand>): string {
  switch (command.kind) {
    case "remove-patrol-size":
      return "removeHellPatrolSize";
    case "remove-patrol":
      return "removeHellPatrol";
    case "remove-garrison":
      return "removeHellGarrison";
    case "add-garrison":
      return "addHellGarrison";
    case "add-patrol-size":
      return "addHellPatrolSize";
    case "add-patrol":
      return "addHellPatrol";
  }
}
