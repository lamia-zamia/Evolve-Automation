/**
 * The run context A.R.P.A. planning is judged in: what the prestige plan, the challenge and the
 * race say about projects, over and above each project's own settings.
 *
 * Every input is either a persisted script setting or a captured world-state sample, so this is
 * one cheap read per cycle with no panel, no clone and no game global.
 *
 * Two weighting multipliers the legacy path also applied are deliberately absent: the Banana
 * Republic Monument boost and the inflation-challenge Stock Exchange boost. Both are keyed on
 * achievement stars, which live behind the game's `poly` module and have no captured reader yet.
 * They scale the weighting of a project the player already enabled, so their absence changes the
 * order of two wanted purchases rather than spending anything unwanted.
 */

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

export interface CapturedProjectContextDependencies {
  readonly traits: GameRaceTraitSource;
  readonly tech: GameTechSource;
  readonly resources: GameResourceSource;
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

function finite(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createCapturedProjectContextReader(
  dependencies: CapturedProjectContextDependencies,
): CapturedProjectContextReader {
  const { traits, tech, resources, readSettings } = dependencies;

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
          requiredManaRate: finite(
            settings["prestigeVacuumMana"],
            DEFAULT_VACUUM_MANA_REQUIREMENT,
          ),
        })
      ) {
        syphon.weightMultiplier = finite(
          settings["buildingWeightingVacuumCollapse"],
          DEFAULT_VACUUM_WEIGHTING_MULTIPLIER,
        );
      }

      const overrides: Record<string, Readonly<ProjectOverride>> = {};
      if (Object.keys(syphon).length > 0) {
        overrides[MANA_SYPHON] = Object.freeze(syphon);
      }
      return Object.freeze({
        suppressed,
        overrides: Object.freeze(overrides),
      });
    },
  });
}
