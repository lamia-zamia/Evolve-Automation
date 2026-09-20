/**
 * Achievement guards over the captured page surface.
 *
 * The guard decision itself is the existing domain policy; this module only samples its input from
 * the captured root instead of the legacy game/poly/buildings bags. Three guards are answered here
 * because every fact they need is on the captured root: Pacifist (attack count), Cult of
 * Personality (which is Pacifist inverted) and Second Evolution (species against gods).
 *
 * The remaining four need a fact the capture does not name yet — Dreaded a dreadnought count,
 * Anarchist the live government, Energetic a feat star and thermal-collector count, Red Dead a red
 * spaceport count — so they report `unavailable` rather than guess. A caller must fail closed on
 * that, never treat it as "guard inactive".
 */

import {
  isAchievementGuardActive,
  type AchievementGuardInput,
  type AchievementGuardName,
} from "../../../../domain/progression/prestige/achievement-guards.ts";
import { readCapturedAscensionLevel } from "../../ascension-level.ts";
import { readCapturedAchievementStar } from "../../captured-achievements.ts";
import {
  finiteNonNegative,
  isRecord,
  readProperty,
} from "../../../validation.ts";

export type CapturedAchievementGuardResult =
  | { readonly status: "active" }
  | { readonly status: "inactive" }
  | { readonly status: "unavailable"; readonly field: string };

/** The achievement each guard keeps reachable, under the game's own id. */
const GUARD_ACHIEVEMENT_IDS: Readonly<Record<string, string>> = Object.freeze({
  guardPacifist: "pacifist",
  guardCultOfPersonality: "cult_of_personality",
  guardSecondEvolution: "second_evolution",
});

function unavailableGuard(field: string): CapturedAchievementGuardResult {
  return Object.freeze({ status: "unavailable", field });
}

function readGuardBase(
  root: unknown,
  settings: Record<string, unknown>,
  guard: AchievementGuardName,
):
  | {
      readonly enabled: boolean;
      readonly earnedStar: number;
      readonly targetStar: number;
    }
  | CapturedAchievementGuardResult {
  const master = settings["achievementGuards"];
  const selected = settings[guard];
  if (master === false || selected === false) {
    return Object.freeze({ status: "inactive" });
  }
  if (typeof master !== "boolean" || typeof selected !== "boolean") {
    return unavailableGuard(guard);
  }
  const achievementId = GUARD_ACHIEVEMENT_IDS[guard];
  if (achievementId === undefined) return unavailableGuard(guard);
  const earnedStar = readCapturedAchievementStar(root, achievementId);
  if (earnedStar === undefined) {
    return unavailableGuard(`stats.achieve.${achievementId}`);
  }
  const targetStar = readCapturedAscensionLevel(root);
  if (targetStar === undefined) return unavailableGuard("race");
  return Object.freeze({ enabled: true, earnedStar, targetStar });
}

function isGuardResult(
  value: unknown,
): value is CapturedAchievementGuardResult {
  return isRecord(value) && typeof value["status"] === "string";
}

function readPacifistInput(
  root: unknown,
  settings: Record<string, unknown>,
): Readonly<AchievementGuardInput> | CapturedAchievementGuardResult {
  const base = readGuardBase(root, settings, "guardPacifist");
  if (isGuardResult(base)) {
    return base.status === "inactive"
      ? Object.freeze({
          guard: "guardPacifist",
          enabled: false,
          earnedStar: 0,
          targetStar: 0,
          attacks: 0,
        })
      : base;
  }
  const attacks = finiteNonNegative(
    readProperty(readProperty(root, "stats"), "attacks"),
  );
  if (attacks === undefined) return unavailableGuard("stats.attacks");
  return Object.freeze({ ...base, guard: "guardPacifist", attacks });
}

/**
 * Whether `guard` is currently keeping the run eligible for its achievement, sampled from the
 * captured root. `unavailable` means the capture cannot answer, not that the guard is off.
 */
export function readCapturedAchievementGuard(
  root: unknown,
  settingsValue: unknown,
  guard: AchievementGuardName,
): CapturedAchievementGuardResult {
  const settings = isRecord(settingsValue) ? settingsValue : {};
  if (guard === "guardPacifist") {
    const input = readPacifistInput(root, settings);
    if (isGuardResult(input)) return input;
    return Object.freeze({
      status: isAchievementGuardActive(input) ? "active" : "inactive",
    });
  }
  if (guard === "guardCultOfPersonality" || guard === "guardSecondEvolution") {
    const base = readGuardBase(root, settings, guard);
    if (isGuardResult(base)) return base;
    if (guard === "guardSecondEvolution") {
      const race = readProperty(root, "race");
      const species = readProperty(race, "species");
      const gods = readProperty(race, "gods");
      if (typeof species !== "string" || typeof gods !== "string") {
        return unavailableGuard("race.species");
      }
      return Object.freeze({
        status: isAchievementGuardActive({
          ...base,
          guard,
          species,
          gods,
        })
          ? "active"
          : "inactive",
      });
    }
    // Cult of Personality is exactly "Pacifist is not being guarded", so its own input carries the
    // Pacifist one; an unreadable Pacifist makes this guard unanswerable too.
    const pacifist = readPacifistInput(root, settings);
    if (isGuardResult(pacifist)) return pacifist;
    return Object.freeze({
      status: isAchievementGuardActive({ ...base, guard, pacifist })
        ? "active"
        : "inactive",
    });
  }
  return unavailableGuard(guard);
}
