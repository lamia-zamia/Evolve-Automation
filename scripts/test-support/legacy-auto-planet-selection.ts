/**
 * Frozen copy of the legacy createAutoPlanetSelection factory, kept only as
 * the parity oracle for the migrated planet-selection slice tests. Do not wire
 * into production.
 */
import type { AutomationDependencies } from "../../src/automation/dependencies.ts";

type Dependencies = AutomationDependencies<
  | "getGame"
  | "getSettings"
  | "getGeneratePlanets"
  | "getStarLevel"
  | "getIsAchievementUnlocked"
  | "getPlanetBiomeGenus"
  | "getRaces"
  | "getPlanetBiomes"
  | "getPlanetTraits"
  | "getDocument"
  | "getMouseEvent"
>;
export function createLegacyAutoPlanetSelection({
  getGame,
  getSettings,
  getGeneratePlanets,
  getStarLevel,
  getIsAchievementUnlocked,
  getPlanetBiomeGenus,
  getRaces,
  getPlanetBiomes,
  getPlanetTraits,
  getDocument,
  getMouseEvent,
}: Dependencies) {
  return function autoPlanetSelection() {
    const game = getGame();
    const settings = getSettings();
    const generatePlanets = getGeneratePlanets();
    const isAchievementUnlocked = getIsAchievementUnlocked();
    const planetBiomeGenus = getPlanetBiomeGenus();
    const races = getRaces();
    const planetBiomes = getPlanetBiomes();
    const planetTraits = getPlanetTraits();
    const document = getDocument();
    const MouseEvent = getMouseEvent();
    if (game.global.race.universe === "bigbang") {
      return;
    }
    if (!game.global.race.seeded || game.global.race["chose"]) {
      return;
    }
    if (settings.userPlanetTargetName === "none") {
      return;
    }

    let planets = generatePlanets();

    // Let's try to calculate how many achievements we can get here
    let alevel = getStarLevel(settings);
    for (let i = 0; i < planets.length; i++) {
      let planet = planets[i];
      planet.achieve = 0;

      if (!isAchievementUnlocked("biome_" + planet.biome, alevel)) {
        planet.achieve++;
      }
      for (let trait of planet.traits) {
        if (
          trait !== "none" &&
          !isAchievementUnlocked("atmo_" + trait, alevel)
        ) {
          planet.achieve++;
        }
      }
      if (planetBiomeGenus[planet.biome]) {
        for (let id in races) {
          if (
            races[id].genus === planetBiomeGenus[planet.biome] &&
            !isAchievementUnlocked("extinct_" + id, alevel)
          ) {
            planet.achieve++;
          }
        }
        // All races have same genus, no need to check both
        if (
          !isAchievementUnlocked(
            "genus_" + planetBiomeGenus[planet.biome],
            alevel,
          )
        ) {
          planet.achieve++;
        }
      }
      // Target oceanic for Madagascar Tree, unless current god is already sharkin
      if (
        !isAchievementUnlocked("madagascar_tree", alevel) &&
        planet.biome === "oceanic" &&
        game.global.race.gods !== "sharkin"
      ) {
        planet.achieve++;
      }
    }

    // Now calculate weightings
    for (let i = 0; i < planets.length; i++) {
      let planet = planets[i];
      planet.weighting = 0;

      planet.weighting += settings["biome_w_" + planet.biome];
      for (let trait of planet.traits) {
        planet.weighting += settings["trait_w_" + trait];
      }

      planet.weighting += planet.achieve * settings["extra_w_Achievement"];
      planet.weighting += planet.orbit * settings["extra_w_Orbit"];

      let numShow = game.global.stats.achieve["miners_dream"]
        ? game.global.stats.achieve["miners_dream"].l >= 4
          ? game.global.stats.achieve["miners_dream"].l * 2 - 3
          : game.global.stats.achieve["miners_dream"].l
        : 0;
      if (game.global.stats.achieve.lamentis?.l >= 0) {
        numShow++;
      }
      for (let id in planet.geology) {
        if (planet.geology[id] === 0) {
          continue;
        }
        if (numShow-- > 0) {
          planet.weighting +=
            (planet.geology[id] / 0.01) * settings["extra_w_" + id];
        } else {
          planet.weighting +=
            (planet.geology[id] > 0 ? 1 : -1) * settings["extra_w_" + id];
        }
      }
    }

    if (settings.userPlanetTargetName === "weighting") {
      planets.sort((a, b) => b.weighting - a.weighting);
    }

    if (settings.userPlanetTargetName === "habitable") {
      planets.sort(
        (a, b) =>
          planetBiomes.indexOf(a.biome) +
          planetTraits.indexOf(a.trait) -
          (planetBiomes.indexOf(b.biome) + planetTraits.indexOf(b.trait)),
      );
    }

    if (settings.userPlanetTargetName === "achieve") {
      planets.sort((a, b) =>
        a.achieve !== b.achieve
          ? b.achieve - a.achieve
          : planetBiomes.indexOf(a.biome) +
            planetTraits.indexOf(a.trait) -
            (planetBiomes.indexOf(b.biome) + planetTraits.indexOf(b.trait)),
      );
    }

    let selectedPlanet = document.getElementById(planets[0].id);
    if (selectedPlanet) {
      // We need a popper to avoid exception when gecking planet
      selectedPlanet.dispatchEvent(new MouseEvent("mouseover", {}));
      selectedPlanet.children[0].click();
    }
  };
}
