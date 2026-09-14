/**
 * The first Phase 3 readers: identity, race traits, tech, resources, and static feature
 * visibility, validated out of the captured live root instead of a cloned `game.global`.
 *
 * Each factory implements one narrow port and takes nothing but the root source, so a feature
 * injects the capability it reads and no more. The sampling readers materialize only the ids they
 * are given — replacing the debug clone with a per-tick clone of the whole world would trade one
 * cost for another, which is exactly what this port shape prevents.
 *
 * Validation is as strict as the game guarantees and no stricter. `global.resource`,
 * `global.tech`, and most of `global.settings` are filled in lazily as features unlock, so an
 * absent entry is a value here (level 0, an absent resource, a hidden feature) rather than a
 * rejected read. The identity fields carry the same treatment for the run's own progression:
 * `race.species`, `race.universe`, and `city.biome` do not exist until evolution has chosen them.
 */

import type {
  GameIdentitySample,
  GameSettingsSample,
  RaceTraitSample,
  ResourceSample,
  ResourceView,
  TechSample,
} from "../../domain/game-world.ts";
import type {
  GameIdentitySource,
  GameRaceTraitSource,
  GameResourceSource,
  GameResourceReadOptions,
  GameSettingsSource,
  GameTechSource,
} from "../../ports/game-world-state.ts";
import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import { isRecord, readProperty } from "../validation.ts";
import { readCapturedResourceView } from "./captured-affordability.ts";

/** The game's `show*` settings are the record of which features it is currently offering. */
const FEATURE_PREFIX = "show";

function readString(owner: unknown, key: string): string {
  const value = readProperty(owner, key);
  return typeof value === "string" ? value : "";
}

/** Lazily created counters: `stats.reset` is guarded by the game itself before it exists. */
function readCounter(owner: unknown, key: string): number {
  const value = Number(readProperty(owner, key));
  return Number.isFinite(value) ? value : 0;
}

/**
 * A trait is a rank the game tests with `if (global.race[trait])`: a number for a ranked trait, and
 * `true` for a flag stored as a boolean. This answers that same truth test. The `race` bag also
 * holds strings and objects that are not traits at all — `species`, `universe`, `governor`,
 * `inactiveTraits` — and those flatten to 0 rather than to a rank nobody set.
 */
function readRank(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return value === true ? 1 : 0;
}

export function createCapturedIdentitySource(
  rootState: GameRootStateSource,
): GameIdentitySource {
  return Object.freeze({
    readIdentity(): GameIdentitySample | undefined {
      const root = rootState.readRoot();
      if (root === undefined) return undefined;
      const race = readProperty(root, "race");
      const city = readProperty(root, "city");
      const stats = readProperty(root, "stats");
      // `city.ptrait` has been an array since the 1.2.12 save migration; anything else is a shape
      // this build does not produce, and reports no planet traits rather than one bogus entry.
      const ptrait = readProperty(city, "ptrait");
      const planetTraits = Array.isArray(ptrait)
        ? Object.freeze(ptrait.filter((entry) => typeof entry === "string"))
        : Object.freeze([]);
      return Object.freeze({
        species: readString(race, "species"),
        universe: readString(race, "universe"),
        biome: readString(city, "biome"),
        planetTraits,
        gods: readString(race, "gods"),
        oldGods: readString(race, "old_gods"),
        resets: readCounter(stats, "reset"),
        days: readCounter(stats, "days"),
        totalDays: readCounter(stats, "tdays"),
      });
    },
  });
}

export function createCapturedGameSettingsSource(
  rootState: GameRootStateSource,
): GameSettingsSource {
  return Object.freeze({
    readGameSettings(): GameSettingsSample | undefined {
      const root = rootState.readRoot();
      if (root === undefined) return undefined;
      const settings = readProperty(root, "settings");
      const visibleFeatures = new Set<string>();
      if (isRecord(settings)) {
        // Every `show*` key the game has switched on, under the game's own name for it. Naming
        // them here instead would be a second catalog to keep in step with upstream.
        for (const [key, value] of Object.entries(settings)) {
          if (key.startsWith(FEATURE_PREFIX) && Boolean(value)) {
            visibleFeatures.add(key);
          }
        }
      }
      return Object.freeze({
        // `settings.pause` is absent on a fresh game; the game reads it as falsy there too.
        paused: Boolean(readProperty(settings, "pause")),
        visibleFeatures,
      });
    },
  });
}

export function createCapturedTechSource(
  rootState: GameRootStateSource,
): GameTechSource {
  return Object.freeze({
    readTech(ids: Iterable<string>): TechSample | undefined {
      const root = rootState.readRoot();
      if (root === undefined) return undefined;
      const tech = readProperty(root, "tech");
      const levels = new Map<string, number>();
      for (const id of ids) {
        // Unresearched tech has no entry at all, which is the game's own "level 0".
        levels.set(id, readCounter(tech, id));
      }
      return Object.freeze({ levels });
    },
  });
}

export function createCapturedRaceTraitSource(
  rootState: GameRootStateSource,
): GameRaceTraitSource {
  return Object.freeze({
    readRaceTraits(traits: Iterable<string>): RaceTraitSample | undefined {
      const root = rootState.readRoot();
      if (root === undefined) return undefined;
      const race = readProperty(root, "race");
      const ranks = new Map<string, number>();
      for (const trait of traits) {
        ranks.set(trait, readRank(readProperty(race, trait)));
      }
      return Object.freeze({ ranks });
    },
  });
}

export function createCapturedResourceSource(
  rootState: GameRootStateSource,
): GameResourceSource {
  return Object.freeze({
    readResources(
      ids: Iterable<string>,
      options?: Readonly<GameResourceReadOptions>,
    ): ResourceSample | undefined {
      const root = rootState.readRoot();
      if (root === undefined) return undefined;
      const resources = new Map<string, ResourceView>();
      for (const id of ids) {
        // The map stays keyed by the requested cost id, including `Species`; the affordability
        // adapter owns alias resolution and the optional regional pool ledger.
        resources.set(id, readCapturedResourceView(root, id, options?.pool));
      }
      return Object.freeze({ resources });
    },
  });
}
