/**
 * Frozen copy of the legacy createAutoEvolution factory, kept only as the
 * parity oracle for the migrated evolution slice tests. Do not wire into
 * production.
 */
import type { AutomationDependencies } from "../../src/automation/dependencies.ts";

type Dependencies = AutomationDependencies<
  | "getGame"
  | "getState"
  | "getSettings"
  | "getSettingsRaw"
  | "getRaces"
  | "loadQueuedSettings"
  | "GameLog"
  | "getChallenges"
  | "getEvolutions"
  | "getPoly"
  | "getResources"
  | "getImitations"
  | "getAutoUniverseSelection"
  | "getAutoPlanetSelection"
>;
export function createLegacyAutoEvolution({
  getGame,
  getState,
  getSettings,
  getSettingsRaw,
  getRaces,
  loadQueuedSettings,
  GameLog,
  getChallenges,
  getEvolutions,
  getPoly,
  getResources,
  getImitations,
  getAutoUniverseSelection,
  getAutoPlanetSelection,
}: Dependencies) {
  return function autoEvolution() {
    const game = getGame();
    const state = getState();
    const settings = getSettings();
    const settingsRaw = getSettingsRaw();
    const races = getRaces();
    const challenges = getChallenges();
    const evolutions = getEvolutions();
    const poly = getPoly();
    const resources = getResources();
    const imitations = getImitations();
    const autoUniverseSelection = getAutoUniverseSelection();
    const autoPlanetSelection = getAutoPlanetSelection();
    if (game.global.race.species !== "protoplasm") {
      return;
    }

    autoUniverseSelection();
    autoPlanetSelection();

    // Wait for universe and planet, we don't want to run auto achievement until we'll land somewhere
    if (
      game.global.race.universe === "bigbang" ||
      (game.global.race.seeded && !game.global.race["chose"])
    ) {
      return;
    }

    if (state.evolutionTarget === null) {
      loadQueuedSettings();

      // Try to pick race for achievement first
      if (settings.userEvolutionTarget === "auto") {
        let raceByWeighting = (Object.values(races) as any[]).sort(
          (a, b) => b.getWeighting() - a.getWeighting(),
        );

        if (game.global.stats.achieve["mass_extinction"]) {
          // With Mass Extinction we can pick any race, go for best one
          state.evolutionTarget = raceByWeighting[0];
        } else {
          // Otherwise go for genus having most weight
          let genusList = (Object.values(races) as any[])
            .map((r) => r.genus)
            .filter((v, i, a) => a.indexOf(v) === i);
          let genusWeights = genusList.map((g) => [
            g,
            (Object.values(races) as any[])
              .filter((r) => r.genus === g)
              .map((r) => r.getWeighting())
              .reduce((sum, next) => sum + next),
          ]);
          let bestGenus = genusWeights.sort((a, b) => b[1] - a[1])[0][0];
          state.evolutionTarget = raceByWeighting.find(
            (r) => r.genus === bestGenus,
          );
        }
      }

      // Auto Achievements disabled, checking user specified race
      if (settings.userEvolutionTarget !== "auto") {
        let userRace = races[settings.userEvolutionTarget];
        if (userRace && userRace.getHabitability() > 0) {
          // Race specified, and condition is met
          state.evolutionTarget = userRace;
        }
      }

      // Try to pull next race from queue
      if (
        state.evolutionTarget === null &&
        settings.evolutionQueueEnabled &&
        settingsRaw.evolutionQueue.length > 0 &&
        (!settings.evolutionQueueRepeat ||
          state.evolutionAttempts < settingsRaw.evolutionQueue.length)
      ) {
        return;
      }

      // Still no target. Fallback to custom, or ent.
      if (state.evolutionTarget === null) {
        state.evolutionTarget =
          races.custom.getHabitability() > 0 ? races.custom : races.entish;
      }
      GameLog.logSuccess(
        "special",
        `Attempting evolution of ${state.evolutionTarget.name}.`,
        ["progress"],
      );
    }

    // Apply challenges
    for (let i = 0; i < challenges.length; i++) {
      if (settings["challenge_" + challenges[i][0].id]) {
        for (let j = 0; j < challenges[i].length; j++) {
          let { id, trait } = challenges[i][j];
          if (
            game.global.race[trait] !== 1 &&
            evolutions[id].click() &&
            (id === "junker" ||
              id === "sludge" ||
              id === "ultra_sludge" ||
              id === "warlord")
          ) {
            return; // Give game time to update state after activating junker
          }
        }
      }
    }

    // Calculate the maximum RNA and DNA required to evolve and don't build more than that
    let maxRNA = 0;
    let maxDNA = 0;

    let evolutionTree =
      state.evolutionTarget.evolutionTree[settings.userEvolutionGenus] ??
      state.evolutionTarget.evolutionTree[
        Object.keys(state.evolutionTarget.evolutionTree)[0]
      ];

    for (let i = 0; i < evolutionTree.length; i++) {
      let evolution = evolutionTree[i];
      let costs = poly.adjustCosts(evolution.definition);

      maxRNA = Math.max(maxRNA, Number(costs["RNA"]?.() ?? 0));
      maxDNA = Math.max(maxDNA, Number(costs["DNA"]?.() ?? 0));
    }

    // Gather some resources and evolve
    let DNAForEvolution = Math.min(
      maxDNA - resources.DNA.currentQuantity,
      resources.DNA.maxQuantity - resources.DNA.currentQuantity,
      resources.RNA.maxQuantity / 2,
    );
    let RNAForDNA = Math.min(
      DNAForEvolution * 2 - resources.RNA.currentQuantity,
      resources.RNA.maxQuantity - resources.RNA.currentQuantity,
    );
    let RNARemaining =
      resources.RNA.currentQuantity + RNAForDNA - DNAForEvolution * 2;
    let RNAForEvolution = Math.min(
      maxRNA - RNARemaining,
      resources.RNA.maxQuantity - RNARemaining,
    );

    let rna = game.actions.evolution.rna;
    let dna = game.actions.evolution.dna;
    for (let i = 0; i < RNAForDNA; i++) {
      rna.action();
    }
    for (let i = 0; i < DNAForEvolution; i++) {
      dna.action();
    }
    for (let i = 0; i < RNAForEvolution; i++) {
      rna.action();
    }

    resources.RNA.currentQuantity = RNARemaining + RNAForEvolution;
    resources.DNA.currentQuantity =
      resources.DNA.currentQuantity + DNAForEvolution;

    // Lets go for our targeted evolution
    for (let i = 0; i < evolutionTree.length; i++) {
      let action = evolutionTree[i];
      if (action.isUnlocked()) {
        // Don't click challenges which already active
        let challenge = challenges.flat().find((c) => c.id === action.id);
        if (challenge && game.global.race[challenge.trait]) {
          continue;
        }
        if (action.click()) {
          // If we successfully click the action then return to give the ui some time to refresh
          return;
        } else {
          // Our path is unlocked but we can't click it yet
          break;
        }
      }
    }

    if (
      evolutions.mitochondria.count < 1 ||
      resources.RNA.maxQuantity < maxRNA ||
      resources.DNA.maxQuantity < maxDNA
    ) {
      evolutions.mitochondria.click();
    }
    if (
      evolutions.eukaryotic_cell.count < 1 ||
      resources.DNA.maxQuantity < maxDNA
    ) {
      evolutions.eukaryotic_cell.click();
    }
    if (resources.RNA.maxQuantity < maxRNA) {
      evolutions.membrane.click();
    }
    if (evolutions.nucleus.count < 10) {
      evolutions.nucleus.click();
    }
    if (evolutions.organelles.count < 10) {
      evolutions.organelles.click();
    }

    const userImitateRace = (Object.values(imitations) as any[]).find(
      (race) => {
        return race.id === `s-${settings.imitateRace}`;
      },
    );

    if (game.global.race.evoFinalMenu) {
      if (userImitateRace) {
        const selectImitateRace = userImitateRace.click();

        if (!selectImitateRace) {
          GameLog.logDanger(
            "special",
            `${settings.imitateRace} not avaialble for imitation. Please select an available race.`,
            ["progress", "achievements"],
          );
        }
      } else {
        GameLog.logDanger(
          "special",
          `No race selected for imitation. Please select an available race to continue.`,
          ["progress", "achievements"],
        );
      }
    }
  };
}
