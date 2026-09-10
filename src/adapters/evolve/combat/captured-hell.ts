/** Captured Hell-fortress management for the independent runtime. */

import type { CommandExecutionOutcome } from "../../../domain/commands.ts";
import {
  planHell,
  prepareHellCycle,
  type HellCycleInput,
} from "../../../domain/combat/hell.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { stale, SUCCEEDED } from "../../command-outcomes.ts";
import { isRecord, readProperty } from "../../validation.ts";

const FORT_CONTROL = "fort";
const GARRISON_CONTROLS = ["garrison", "c_garrison"] as const;

interface HellSession {
  readonly root: unknown;
  readonly input: Readonly<HellCycleInput>;
}

function finiteHellValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function settingNumber(
  settings: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  return finiteHellValue(settings[key]) ?? fallback;
}

function emptyHellInput(): HellCycleInput {
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

function readWarlordInput(
  root: unknown,
  settingsValue: unknown,
): HellCycleInput {
  if (!isRecord(root)) return emptyHellInput();
  const race = readProperty(root, "race");
  const portal = readProperty(root, "portal");
  if (!isRecord(race) || !isRecord(portal) || race["warlord"] !== true) {
    return emptyHellInput();
  }
  const minions = readProperty(portal, "minions");
  const throne = readProperty(portal, "throne");
  const enemies = readProperty(throne, "enemy");
  const settings = isRecord(settingsValue) ? settingsValue : {};
  return Object.freeze({
    ...emptyHellInput(),
    available: true,
    warlord: true,
    enemies: Array.isArray(enemies) ? enemies.length : 0,
    minions: finiteHellValue(readProperty(minions, "spawns")) ?? 0,
    handleEnemyFortress: settings["warlordHandleFortress"] === true,
    minimumMinions: finiteHellValue(settings["warlordMinimumMinions"]) ?? 0,
  });
}

function readHellInput(root: unknown, settingsValue: unknown): HellCycleInput {
  if (!isRecord(root)) return emptyHellInput();
  const race = readProperty(root, "race");
  const portal = readProperty(root, "portal");
  if (!isRecord(race) || !isRecord(portal)) return emptyHellInput();
  if (race["warlord"] === true) return readWarlordInput(root, settingsValue);

  const garrison = readProperty(readProperty(root, "civic"), "garrison");
  const fortress = readProperty(portal, "fortress");
  if (!isRecord(garrison) || !isRecord(fortress)) return emptyHellInput();
  const workers = finiteHellValue(readProperty(garrison, "workers"));
  const maximumWorkers = finiteHellValue(readProperty(garrison, "max"));
  const crew = finiteHellValue(readProperty(garrison, "crew"));
  const hellSoldiers = finiteHellValue(readProperty(fortress, "garrison"));
  const hellPatrols = finiteHellValue(readProperty(fortress, "patrols"));
  const hellPatrolSize = finiteHellValue(readProperty(fortress, "patrol_size"));
  if (
    workers === undefined ||
    maximumWorkers === undefined ||
    crew === undefined ||
    hellSoldiers === undefined ||
    hellPatrols === undefined ||
    hellPatrolSize === undefined
  ) {
    return emptyHellInput();
  }
  const space = readProperty(root, "space");
  const fob = readProperty(space, "fob");
  const fobTroops = finiteHellValue(readProperty(fob, "troops")) ?? 0;
  const settings = isRecord(settingsValue) ? settingsValue : {};
  const tech = readProperty(root, "tech");
  const city = readProperty(root, "city");
  const turret = readProperty(portal, "turret");
  const warDrone = readProperty(portal, "war_drone");
  const warDroid = readProperty(portal, "war_droid");
  const bootCamp = readProperty(city, "boot_camp");
  const govern = readProperty(readProperty(root, "civic"), "govern");
  const elysium = finiteHellValue(readProperty(tech, "elysium")) ?? 0;
  const homeGarrison = settingNumber(settings, "hellHomeGarrison", 10);
  const minimumHellSoldiers = settingNumber(settings, "hellMinSoldiers", 20);
  const minimumSoldierPercent = settingNumber(
    settings,
    "hellMinSoldiersPercent",
    90,
  );
  return Object.freeze({
    ...emptyHellInput(),
    available: true,
    maximumSoldiers: maximumWorkers - crew,
    currentSoldiers: workers - crew,
    currentCityGarrison: workers - crew - hellSoldiers - fobTroops,
    maximumCityGarrison: maximumWorkers - crew - hellSoldiers,
    hellSoldiers,
    hellPatrols,
    hellPatrolSize,
    // DeadSpace initializes `assigned` lazily; the compatibility bridge treats it as zero.
    hellAssigned: finiteHellValue(readProperty(fortress, "assigned")) ?? 0,
    currentHellGarrison: hellSoldiers - hellPatrols * hellPatrolSize,
    homeGarrison,
    minimumHellSoldiers,
    minimumSoldierPercent,
    elysiumUnlocked: elysium >= 3,
    fortressWalls: finiteHellValue(readProperty(fortress, "walls")) ?? 0,
    fortressThreat: finiteHellValue(readProperty(fortress, "threat")) ?? 0,
    lowWallsMultiplier: settingNumber(settings, "hellLowWallsMulti", 3),
    targetFortressDamage: settingNumber(
      settings,
      "hellTargetFortressDamage",
      100,
    ),
    turretCount: finiteHellValue(readProperty(turret, "on")) ?? 0,
    turretTechnology: finiteHellValue(readProperty(tech, "turret")) ?? 0,
    handlePatrolSize: settings["hellHandlePatrolSize"] !== false,
    patrolThreatPercent: settingNumber(settings, "hellPatrolThreatPercent", 8),
    patrolDroneModifier: settingNumber(settings, "hellPatrolDroneMod", 5),
    patrolDroidModifier: settingNumber(settings, "hellPatrolDroidMod", 5),
    patrolBootcampModifier: settingNumber(settings, "hellPatrolBootcampMod", 0),
    minimumPatrolRating: settingNumber(settings, "hellPatrolMinRating", 30),
    bolsterPatrolRating: settingNumber(
      settings,
      "hellBolsterPatrolRating",
      300,
    ),
    bolsterPercentTop: settingNumber(
      settings,
      "hellBolsterPatrolPercentTop",
      50,
    ),
    bolsterPercentBottom: settingNumber(
      settings,
      "hellBolsterPatrolPercentBottom",
      20,
    ),
    warDroneCount: finiteHellValue(readProperty(warDrone, "on")) ?? 0,
    portalTechnology: finiteHellValue(readProperty(tech, "portal")) ?? 0,
    warDroidCount: finiteHellValue(readProperty(warDroid, "on")) ?? 0,
    hellDroidTechnology: Boolean(readProperty(tech, "hdroid")),
    bootCampCount: finiteHellValue(readProperty(bootCamp, "count")) ?? 0,
    manageAuthority: settings["authorityManage"] === true,
    minimumAuthority: settingNumber(settings, "generalMinimumAuthority", 0),
    minimumAuthorityPatrolPercent: settingNumber(
      settings,
      "generalAuthorityMinPatrolPercent",
      0,
    ),
    evilTechnology: finiteHellValue(readProperty(tech, "evil")) ?? 0,
    grenadier: readProperty(race, "grenadier") === true,
    government:
      typeof readProperty(govern, "type") === "string"
        ? (readProperty(govern, "type") as string)
        : "",
  });
}

const HELL_ADJUSTMENT_METHODS = Object.freeze({
  "remove-patrol-size": "patSizeDec",
  "remove-patrol": "patDec",
  "remove-garrison": "aLast",
  "add-garrison": "aNext",
  "add-patrol-size": "patSizeInc",
  "add-patrol": "patInc",
} as const);

function applyHellManagement(
  decision: Extract<
    ReturnType<typeof prepareHellCycle>,
    { kind: "manage-hell" }
  >,
  control: ReturnType<GameControlRegistry["resolve"]>,
  controls: GameControlRegistry,
): CommandExecutionOutcome {
  if (control === undefined) {
    return stale(
      "hell-controls-unavailable",
      "the captured Hell fortress control is unavailable",
    );
  }
  for (const command of decision.commands) {
    const method = HELL_ADJUSTMENT_METHODS[command.kind];
    if (!control.methods.includes(method)) {
      return stale(
        "hell-controls-unavailable",
        `the captured Hell fortress control lacks ${method}`,
      );
    }
    if (!Number.isSafeInteger(command.count) || command.count < 0) {
      return stale(
        "hell-command-invalid",
        `invalid Hell adjustment count: ${command.count}`,
      );
    }
    for (let i = 0; i < command.count; i += 1) {
      const result = controls.invoke(control, method);
      if (!result.ok) {
        return stale(
          "hell-controls-unavailable",
          `Hell adjustment failed: ${result.reason}`,
        );
      }
    }
  }
  return SUCCEEDED;
}

function readSoldierTarget(
  controls: GameControlRegistry,
  targetRating: number,
): number | undefined {
  if (targetRating <= 0) return 0;
  const control = GARRISON_CONTROLS.map((id) => controls.resolve(id)).find(
    (candidate) => candidate !== undefined,
  );
  if (control === undefined || !control.methods.includes("rating")) {
    return undefined;
  }
  // DeadSpace's garrison.rating(10, true) renders armyRating(10,'army',0) / 10,
  // the same per-soldier sample used by the compatibility target inversion.
  const result = controls.invoke(control, "rating", [10, true]);
  if (!result.ok) return undefined;
  const perSoldier = finiteHellValue(result.value);
  if (perSoldier === undefined || perSoldier <= 0) return undefined;
  return Math.ceil(targetRating / perSoldier);
}

export interface CapturedHellAutomation {
  readonly run: () => CommandExecutionOutcome;
}

export function createCapturedHellAutomation(dependencies: {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
}): CapturedHellAutomation {
  let session: HellSession | null = null;

  return Object.freeze({
    run(): CommandExecutionOutcome {
      const root = dependencies.rootState.readRoot();
      const input = readHellInput(root, dependencies.readSettings());
      session = Object.freeze({ root, input });
      const decision = prepareHellCycle(input);
      if (decision === null) return SUCCEEDED;

      if (dependencies.rootState.readRoot() !== session.root) {
        return stale("hell-root-changed", "game root changed after sampling");
      }
      const current = prepareHellCycle(
        readHellInput(session.root, dependencies.readSettings()),
      );
      if (
        current === null ||
        JSON.stringify(current) !== JSON.stringify(decision)
      ) {
        return stale(
          "hell-plan-no-longer-valid",
          "the captured Hell plan is no longer valid",
        );
      }
      const control = dependencies.controls.resolve(FORT_CONTROL);
      if (decision.kind === "manage-hell") {
        return applyHellManagement(decision, control, dependencies.controls);
      }
      if (decision.kind === "calculate-hell-targets") {
        const garrisonSoldiers = readSoldierTarget(
          dependencies.controls,
          decision.garrisonRating,
        );
        const patrolSoldiers =
          decision.patrolRating === null
            ? decision.input.hellPatrolSize
            : readSoldierTarget(dependencies.controls, decision.patrolRating);
        if (garrisonSoldiers === undefined || patrolSoldiers === undefined) {
          return stale(
            "hell-calculation-unavailable",
            "the captured Hell soldier-rating query is unavailable",
          );
        }
        const planned = planHell(decision, {
          garrisonSoldiers,
          patrolSoldiers,
          authority: Object.freeze({
            unlocked: false,
            current: 0,
            maximum: 0,
            scriptTick: 0,
            debugEnabled: false,
          }),
        });
        if (planned === null) return SUCCEEDED;
        return applyHellManagement(planned, control, dependencies.controls);
      }
      if (decision.kind !== "attack-enemy-fortress") return SUCCEEDED;
      if (control === undefined || !control.methods.includes("attack")) {
        return stale(
          "hell-controls-unavailable",
          "the captured Hell fortress control is unavailable",
        );
      }
      const result = dependencies.controls.invoke(control, "attack", [0]);
      return result.ok
        ? SUCCEEDED
        : stale(
            "hell-controls-unavailable",
            `Hell fortress attack failed: ${result.reason}`,
          );
    },
  });
}
