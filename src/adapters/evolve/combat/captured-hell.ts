/** Captured Warlord Hell-fortress attacks for the independent runtime. */

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
      const input = readWarlordInput(root, dependencies.readSettings());
      session = Object.freeze({ root, input });
      const decision = prepareHellCycle(input);
      if (decision === null) return SUCCEEDED;
      if (decision.kind !== "attack-enemy-fortress") return SUCCEEDED;

      if (dependencies.rootState.readRoot() !== session.root) {
        return stale("hell-root-changed", "game root changed after sampling");
      }
      const current = prepareHellCycle(
        readWarlordInput(session.root, dependencies.readSettings()),
      );
      if (current?.kind !== "attack-enemy-fortress") {
        return stale(
          "hell-attack-no-longer-valid",
          "the Warlord fortress attack is no longer valid",
        );
      }
      const control = dependencies.controls.resolve(FORT_CONTROL);
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
