import type {
  PlanetCandidate,
  PlanetSelectionDecision,
  PlanetSelectionGate,
} from "../../../../domain/progression/evolution/planet-selection.ts";
import type { DecisionExecutor } from "../../../../ports/decision-executor.ts";
import type {
  PlanetSelectionCandidatesSample,
  PlanetSelectionReader,
} from "../../../../ports/planet-selection.ts";
import type { PlanetSelectionControls } from "../../../../ports/progression-controls.ts";
import { stale, SUCCEEDED } from "../../../command-outcomes.ts";
import {
  requireFunction,
  requireNumber,
  requireRecord,
} from "../../../validation.ts";

export interface PlanetSelectionReaderDependencies {
  readonly getGame: () => unknown;
  readonly getSettings: () => unknown;
  /**
   * TRANSITIONAL: planet candidates still come from the script-owned
   * `generatePlanets` replica of the game's `setPlanet`. Replacing that replica
   * with a validated game read is a Milestone 5 / upstream-Vue3 concern if the
   * game ever exposes the generated list directly; the migrated autoEvolution
   * decision slice only consumes this reader through `runPlanetSelection` and
   * does not own the planet-generation surface.
   */
  readonly getGeneratePlanets: () => unknown;
  readonly getStarLevel: () => unknown;
  readonly getIsAchievementUnlocked: () => unknown;
  readonly getRaces: () => unknown;
  readonly biomeGenus: Readonly<Record<string, string>>;
  readonly biomeOrder: readonly string[];
}

function requireRace(game: unknown): Record<string, unknown> {
  return requireRecord(
    requireRecord(requireRecord(game, "game")["global"], "game.global")["race"],
    "game.global.race",
  );
}

/**
 * Legacy read `achieve[id] ? achieve[id].l : ...` / `achieve[id]?.l`; entries
 * are lazily created, and a present entry without a numeric level flowed
 * through arithmetic as undefined. null preserves the absent entry and NaN
 * collapses the present-but-unset level to the same comparisons legacy made.
 */
function achievementLevel(value: unknown): number | null {
  if (!value) {
    return null;
  }
  const level =
    typeof value === "object"
      ? (value as Record<string, unknown>)["l"]
      : undefined;
  return typeof level === "number" ? level : NaN;
}

export function createPlanetSelectionReader(
  dependencies: PlanetSelectionReaderDependencies,
): PlanetSelectionReader {
  return Object.freeze({
    sampleGate(): PlanetSelectionGate {
      const race = requireRace(dependencies.getGame());
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const targetName = settings["userPlanetTargetName"];
      const universe = race["universe"];
      return Object.freeze({
        universe: typeof universe === "string" ? universe : null,
        seeded: Boolean(race["seeded"]),
        chose: Boolean(race["chose"]),
        // Legacy only ever compared this setting with ===; a non-string value
        // matched neither "none" nor a sort mode, so it stays lenient as null.
        targetName: typeof targetName === "string" ? targetName : null,
      });
    },

    sampleCandidates(): PlanetSelectionCandidatesSample {
      const race = requireRace(dependencies.getGame());
      const settings = requireRecord(dependencies.getSettings(), "settings");
      const stats = requireRecord(
        requireRecord(
          requireRecord(dependencies.getGame(), "game")["global"],
          "game.global",
        )["stats"],
        "game.global.stats",
      );
      const achieve = requireRecord(
        stats["achieve"],
        "game.global.stats.achieve",
      );

      const generate = requireFunction(
        dependencies.getGeneratePlanets(),
        "generatePlanets",
      );
      const generated = generate();
      if (!Array.isArray(generated) || generated.length === 0) {
        throw new TypeError(
          "generatePlanets must return at least one candidate",
        );
      }
      const planets: PlanetCandidate[] = generated.map((value, index) => {
        const planet = requireRecord(value, `planets[${index}]`);
        const id = planet["id"];
        if (typeof id !== "string") {
          throw new TypeError(`planets[${index}].id must be a string`);
        }
        const biome = planet["biome"];
        if (typeof biome !== "string") {
          throw new TypeError(`planets[${index}].biome must be a string`);
        }
        const rawTraits = planet["traits"];
        if (!Array.isArray(rawTraits)) {
          throw new TypeError(`planets[${index}].traits must be an array`);
        }
        const traits = rawTraits.map((trait, traitIndex) => {
          if (typeof trait !== "string") {
            throw new TypeError(
              `planets[${index}].traits[${traitIndex}] must be a string`,
            );
          }
          return trait;
        });
        const rawGeology = requireRecord(
          planet["geology"],
          `planets[${index}].geology`,
        );
        const geology: Record<string, number> = {};
        for (const key of Object.keys(rawGeology)) {
          geology[key] = requireNumber(
            rawGeology[key],
            `planets[${index}].geology.${key}`,
          );
        }
        return Object.freeze({
          id,
          biome,
          traits: Object.freeze(traits),
          orbit: requireNumber(planet["orbit"], `planets[${index}].orbit`),
          geology: Object.freeze(geology),
        });
      });

      // Legacy read each weighting setting directly; absent keys flowed as
      // undefined into the weighting sum. Non-numbers stay undefined so the
      // planner reproduces that NaN poisoning.
      const weightOf = (key: string): number | undefined => {
        const value = settings[key];
        return typeof value === "number" ? value : undefined;
      };
      const biomeWeights: Record<string, number | undefined> = {};
      const traitWeights: Record<string, number | undefined> = {};
      const geologyWeights: Record<string, number | undefined> = {};
      for (const planet of planets) {
        biomeWeights[planet.biome] = weightOf(`biome_w_${planet.biome}`);
        for (const trait of planet.traits) {
          traitWeights[trait] = weightOf(`trait_w_${trait}`);
        }
        for (const id of Object.keys(planet.geology)) {
          geologyWeights[id] = weightOf(`extra_w_${id}`);
        }
      }

      const races = requireRecord(dependencies.getRaces(), "races");
      const raceGenusById: Record<string, string | null> = {};
      for (const raceId of Object.keys(races)) {
        const value = races[raceId];
        const genus =
          typeof value === "object" && value !== null
            ? (value as Record<string, unknown>)["genus"]
            : undefined;
        raceGenusById[raceId] = typeof genus === "string" ? genus : null;
      }

      const getStarLevel = requireFunction(
        dependencies.getStarLevel(),
        "getStarLevel",
      );
      const gods = race["gods"];
      return Object.freeze({
        planets: Object.freeze(planets),
        gods: typeof gods === "string" ? gods : null,
        starLevel: requireNumber(getStarLevel(settings), "starLevel"),
        raceGenusById: Object.freeze(raceGenusById),
        biomeGenus: dependencies.biomeGenus,
        minersDreamLevel: achievementLevel(achieve["miners_dream"]),
        lamentisLevel: achievementLevel(achieve["lamentis"]),
        biomeWeights: Object.freeze(biomeWeights),
        traitWeights: Object.freeze(traitWeights),
        achievementWeight: weightOf("extra_w_Achievement"),
        orbitWeight: weightOf("extra_w_Orbit"),
        geologyWeights: Object.freeze(geologyWeights),
        biomeOrder: dependencies.biomeOrder,
      });
    },

    achievementsUnlocked(
      ids: readonly string[],
      starLevel: number,
    ): Readonly<Record<string, boolean>> {
      const isUnlocked = requireFunction(
        dependencies.getIsAchievementUnlocked(),
        "isAchievementUnlocked",
      );
      const unlocked: Record<string, boolean> = {};
      for (const id of ids) {
        unlocked[id] = Boolean(isUnlocked(id, starLevel));
      }
      return Object.freeze(unlocked);
    },
  });
}

export function createPlanetSelectionCommandExecutor(dependencies: {
  readonly getGame: () => unknown;
  readonly controls: PlanetSelectionControls;
}): DecisionExecutor<PlanetSelectionDecision> {
  return Object.freeze({
    execute(decision: Readonly<PlanetSelectionDecision>) {
      const race = requireRace(dependencies.getGame());
      if (
        race["universe"] === "bigbang" ||
        !race["seeded"] ||
        Boolean(race["chose"])
      ) {
        return stale(
          "planet-selection-unavailable",
          "planet selection became unavailable",
        );
      }
      if (!dependencies.controls.selectPlanet(decision.elementId)) {
        return stale(
          "planet-control-unavailable",
          "planet selection control became unavailable",
        );
      }
      return SUCCEEDED;
    },
  });
}
