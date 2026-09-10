/** Captured Hell-fortress management for the independent runtime. */

import type { CommandExecutionOutcome } from "../../../domain/commands.ts";
import {
  prepareHellCycle,
  type HellCycleInput,
} from "../../../domain/combat/hell.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { stale, SUCCEEDED } from "../../command-outcomes.ts";
import { isRecord, readProperty } from "../../validation.ts";

const FORT_CONTROL = "fort";

interface HellSession {
  readonly root: unknown;
  readonly input: Readonly<HellCycleInput>;
}

function finiteHellValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
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
  const homeGarrison = finiteHellValue(settings["hellHomeGarrison"]) ?? 10;
  const minimumHellSoldiers =
    finiteHellValue(settings["hellMinSoldiers"]) ?? 20;
  const minimumSoldierPercent =
    finiteHellValue(settings["hellMinSoldiersPercent"]) ?? 90;
  const tech = readProperty(root, "tech");
  const elysium = finiteHellValue(readProperty(tech, "elysium")) ?? 0;
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
    handlePatrolSize: settings["hellHandlePatrolSize"] !== false,
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
        return stale(
          "hell-calculation-unavailable",
          "the captured Hell soldier-rating query is unavailable",
        );
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
