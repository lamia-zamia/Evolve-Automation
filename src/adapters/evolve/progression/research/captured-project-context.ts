/**
 * The run context A.R.P.A. planning is judged in: what the prestige plan, the challenge and the
 * race say about projects, over and above each project's own settings.
 *
 * Every input is either a persisted script setting or a captured world-state sample, so this is
 * one cheap read per cycle with no panel, no clone and no game global.
 *
 * The project context samples the two run-level achievement gates only when their settings and
 * race flags make them relevant. They scale projects the player already enabled; they do not
 * create a new candidate.
 */

import {
  achievementStar,
  bananaObjectiveComplete,
} from "../../../../domain/game-achievements.ts";
import {
  hasTech,
  hasTrait,
  resourceView,
  type RaceTraitSample,
  type TechSample,
} from "../../../../domain/game-world.ts";
import type {
  ProjectContext,
  ProjectOverride,
} from "../../../../domain/progression/research/project.ts";
import {
  DEFAULT_VACUUM_MANA_REQUIREMENT,
  DEFAULT_VACUUM_WEIGHTING_MULTIPLIER,
  isVacuumCollapseManaStageReady,
} from "../../../../domain/progression/prestige/vacuum.ts";
import type {
  GameRaceTraitSource,
  GameResourceSource,
  GameTechSource,
} from "../../../../ports/game-world-state.ts";
import type { GameAchievementSource } from "../../../../ports/game-achievement-state.ts";
import { isNonArrayRecord } from "../../../validation.ts";

/** The game's own id for the Mana Syphon, the one project the prestige plan overrides. */
const MANA_SYPHON = "syphon";

/**
 * `isEarlyGame` in the game's own terms: before MAD, except for the starts that begin past it and
 * the true-path-like races the game measures by `high_tech` instead.
 */
const EARLY_GAME_TRAITS = Object.freeze([
  "cataclysm",
  "orbit_decayed",
  "lone_survivor",
  "warlord",
  "truepath",
  "sludge",
  "ultra_sludge",
]);
const EARLY_GAME_TECH = Object.freeze(["mad", "high_tech"]);
const SYPHON_TRAITS = Object.freeze(["witch_hunter"]);
const ACHIEVEMENT_LEVEL_TRAITS = Object.freeze([
  "no_plasmid",
  "no_trade",
  "no_craft",
  "no_crispr",
  "weak_mastery",
  "nerfed",
  "badgenes",
]);

export interface CapturedProjectContextDependencies {
  readonly traits: GameRaceTraitSource;
  readonly tech: GameTechSource;
  readonly resources: GameResourceSource;
  readonly achievements: GameAchievementSource;
  /** Persisted script settings; external input, normalized here. */
  readonly readSettings: () => unknown;
}

export interface CapturedProjectContextReader {
  /** A fresh context for one cycle. */
  readContext(): ProjectContext;
}

function isEarlyGame(
  traits: Readonly<RaceTraitSample>,
  tech: Readonly<TechSample>,
): boolean {
  if (
    hasTrait(traits, "cataclysm") ||
    hasTrait(traits, "orbit_decayed") ||
    hasTrait(traits, "lone_survivor") ||
    hasTrait(traits, "warlord")
  ) {
    return false;
  }
  if (
    hasTrait(traits, "truepath") ||
    hasTrait(traits, "sludge") ||
    hasTrait(traits, "ultra_sludge")
  ) {
    return !hasTech(tech, "high_tech", 7);
  }
  return !hasTech(tech, "mad");
}

/**
 * Unlike the shared `finite` guard, this coerces (`Number()`, so numeric strings count) and
 * answers a fallback instead of `undefined`. It keeps its own name so the two are never merged.
 */
function finiteWithFallback(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function achievementLevel(traits: Readonly<RaceTraitSample>): number {
  let level = 1;
  for (const trait of ACHIEVEMENT_LEVEL_TRAITS) {
    if (hasTrait(traits, trait)) level++;
  }
  return Math.min(level, 5);
}

export function createCapturedProjectContextReader(
  dependencies: CapturedProjectContextDependencies,
): CapturedProjectContextReader {
  const { traits, tech, resources, achievements, readSettings } = dependencies;

  return Object.freeze({
    readContext(): ProjectContext {
      const raw = readSettings();
      const settings = isNonArrayRecord(raw) ? raw : {};
      const prestigeType = String(settings["prestigeType"] ?? "");

      let suppressed = false;
      if (settings["prestigeMADIgnoreArpa"] === true) {
        const traitSample = traits.readRaceTraits(EARLY_GAME_TRAITS);
        const techSample = tech.readTech(EARLY_GAME_TECH);
        // Before the game has state there is nothing to measure the run against. The setting says
        // not to build projects this early, so an unreadable run is treated as the early one.
        suppressed =
          traitSample === undefined ||
          techSample === undefined ||
          isEarlyGame(traitSample, techSample);
      }

      const syphon: {
        ignoreMaximum?: boolean;
        excluded?: boolean;
        weightMultiplier?: number;
      } = {};
      // A Vacuum Collapse is reached by building Mana Syphons, so its own maximum does not apply
      // once that prestige is the plan. `prestigeWaitAT` is not consulted: it waits on banked
      // accelerated time, which DeadSpace no longer accumulates — `global.settings.at` is only
      // ever written 0 in 1.5.0.
      if (settings["autoPrestige"] === true && prestigeType === "vacuum") {
        syphon.ignoreMaximum = true;
      }
      const syphonTraits = traits.readRaceTraits(SYPHON_TRAITS);
      if (
        settings["prestigeBioseedConstruct"] === true &&
        prestigeType !== "vacuum" &&
        syphonTraits !== undefined &&
        hasTrait(syphonTraits, "witch_hunter")
      ) {
        syphon.excluded = true;
      }
      const mana = resources.readResources(["Mana"]);
      if (
        mana !== undefined &&
        isVacuumCollapseManaStageReady({
          prestigeType,
          manaRate: resourceView(mana, "Mana").rateOfChange,
          requiredManaRate: finiteWithFallback(
            settings["prestigeVacuumMana"],
            DEFAULT_VACUUM_MANA_REQUIREMENT,
          ),
        })
      ) {
        syphon.weightMultiplier = finiteWithFallback(
          settings["buildingWeightingVacuumCollapse"],
          DEFAULT_VACUUM_WEIGHTING_MULTIPLIER,
        );
      }

      const overrides: Record<string, Readonly<ProjectOverride>> = {};
      if (Object.keys(syphon).length > 0) {
        overrides[MANA_SYPHON] = Object.freeze(syphon);
      }
      const bananaGuardEnabled =
        settings["achievementGuards"] === true &&
        settings["guardBananaRepublic"] === true;
      const inflationAssistEnabled =
        settings["inflationChallengeAssist"] === true;
      if (bananaGuardEnabled || inflationAssistEnabled) {
        const raceTraits = traits.readRaceTraits([
          "banana",
          "inflation",
          ...ACHIEVEMENT_LEVEL_TRAITS,
        ]);
        if (raceTraits !== undefined) {
          const bananaRace =
            bananaGuardEnabled && hasTrait(raceTraits, "banana");
          const inflationRun =
            inflationAssistEnabled && hasTrait(raceTraits, "inflation");
          const achievementState = achievements.readAchievementState(
            inflationRun ? ["wheelbarrow"] : [],
            bananaRace ? ["b5"] : [],
          );
          if (achievementState !== undefined) {
            if (
              bananaRace &&
              !bananaObjectiveComplete(achievementState, "b5")
            ) {
              overrides.monument = Object.freeze({
                weightMultiplier: finiteWithFallback(
                  settings["buildingWeightingBananaObjective"],
                  1,
                ),
              });
            }
            if (
              inflationRun &&
              achievementStar(achievementState, "wheelbarrow") <
                achievementLevel(raceTraits)
            ) {
              overrides.stock_exchange = Object.freeze({
                weightMultiplier: finiteWithFallback(
                  settings["buildingWeightingInflationMoney"],
                  1,
                ),
              });
            }
          }
        }
      }
      return Object.freeze({
        suppressed,
        overrides: Object.freeze(overrides),
      });
    },
  });
}
