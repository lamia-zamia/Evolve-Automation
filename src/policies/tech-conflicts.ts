type Cost = Record<string, number>;

type Tech = {
  _vueBinding: string;
  cost: Cost;
};

type FanatAchievement = {
  race: string;
  god: string;
  achieve: string;
};

type TechConflictSettings = {
  researchIgnore: string[];
  prestigeType: string;
  prestigeWhiteholeSaveGems: boolean;
  prestigeVaxStrat: string;
  prestigeDemonicBomb: boolean;
  foreignUnification: boolean;
  prestigeWhiteholeStabiliseMass: boolean;
  prestigeWhiteholeStabiliseCooldown: number;
  userResearchTheology_1: string;
  userResearchTheology_2: string;
  fleetAlienGiftKnowledge: number;
  [key: string]: unknown;
};

type TechConflictResource = {
  name: string;
  currentQuantity: number;
  maxQuantity: number;
};

type TechConflictGame = {
  global: { race: { species: string; gods: string } };
  alevel: () => number;
};

type TechConflictState = { whiteholeLastStabilise?: number };

type TechConflictDependencies = {
  getSettings: () => TechConflictSettings;
  getResources: () => Record<string, TechConflictResource>;
  getState: () => TechConflictState;
  getGame: () => TechConflictGame;
  getIsAchievementUnlocked: () => (achieve: string, level: number) => boolean;
  getNumberString: (value: number) => string;
  guardActive: (setting: string) => boolean;
  guardBananaRepublicActive: () => boolean;
  retirementChallengeAssistActive: () => boolean;
  retirementPreparationMissing: () => string[];
  fanatAchievements: FanatAchievement[];
};

export function createTechConflicts({
  getSettings,
  getResources,
  getState,
  getGame,
  getIsAchievementUnlocked,
  getNumberString,
  guardActive,
  guardBananaRepublicActive,
  retirementChallengeAssistActive,
  retirementPreparationMissing,
  fanatAchievements,
}: TechConflictDependencies) {
  function getTechConflict(tech: Tech): string | false {
    const settings = getSettings();
    const resources = getResources();
    const state = getState();
    const game = getGame();
    const isAchievementUnlocked = getIsAchievementUnlocked();
    let itemId = tech._vueBinding;

    // Skip ignored techs
    if (settings.researchIgnore.includes(itemId)) {
      return "Ignored research";
    }

    // Don't click any reset options without user consent... that would be a dick move, man.
    if (
      itemId === "tech-exotic_infusion" ||
      itemId === "tech-infusion_check" ||
      itemId === "tech-infusion_confirm" ||
      itemId === "tech-dial_it_to_11" ||
      itemId === "tech-limit_collider" ||
      itemId === "tech-demonic_infusion" ||
      itemId === "tech-protocol66" ||
      itemId === "tech-protocol66a" ||
      itemId === "tech-final_ingredient"
    ) {
      return "Reset research";
    }

    // Save soul gems for reset
    if (
      settings.prestigeType === "whitehole" &&
      settings.prestigeWhiteholeSaveGems &&
      itemId !== "tech-virtual_reality" &&
      tech.cost["Soul_Gem"] > resources.Soul_Gem.currentQuantity - 10
    ) {
      return "Saving up Soul Gems for prestige";
    }

    if (
      itemId === "tech-isolation_protocol" &&
      settings.prestigeType !== "retire"
    ) {
      return "Progression fork to Retirement reset";
    }
    if (
      itemId === "tech-isolation_protocol" &&
      retirementChallengeAssistActive()
    ) {
      let missing = retirementPreparationMissing();
      if (missing.length > 0) {
        return `Retirement preparation incomplete: ${missing.join(", ")}`;
      }
    }

    if (
      itemId === "tech-outerplane_summon" &&
      settings.prestigeType !== "demonic"
    ) {
      return "Progression fork to Witch Hunter's Demonic Infusion";
    }

    if (itemId === "tech-focus_cure" && settings.prestigeType !== "matrix") {
      return "Progression fork to Matrix reset";
    }

    if (
      itemId === "tech-purify_essence" &&
      settings.prestigeType !== "apotheosis"
    ) {
      return "Progression fork to Apotheosis";
    }

    if (
      (itemId === "tech-vax_strat1" ||
        itemId === "tech-vax_strat2" ||
        itemId === "tech-vax_strat3" ||
        itemId === "tech-vax_strat4") &&
      !itemId.includes(settings.prestigeVaxStrat)
    ) {
      return "Undesirable Vaccination Strategy";
    }

    // Don't use Dark Bomb if not enabled
    if (
      itemId === "tech-dark_bomb" &&
      (!settings.prestigeDemonicBomb || settings.prestigeType !== "demonic")
    ) {
      return "Dark Bomb disabled";
    }

    // Don't waste phage and plasmid on ascension techs if we're not going there
    if (
      (itemId === "tech-incorporeal" || itemId === "tech-tech_ascension") &&
      settings.prestigeType !== "ascension" &&
      settings.prestigeType !== "apotheosis"
    ) {
      return "Not needed for current prestige";
    }

    // Alien Gift
    if (
      itemId === "tech-xeno_gift" &&
      resources.Knowledge.maxQuantity < settings.fleetAlienGiftKnowledge
    ) {
      return `${getNumberString(
        settings.fleetAlienGiftKnowledge,
      )} Max Knowledge required`;
    }

    // Unification
    if (itemId === "tech-unification2" || itemId === "tech-unite") {
      if (guardBananaRepublicActive()) {
        return "Banana Republic guard";
      }
      if (guardActive("guardCultOfPersonality")) {
        return "Cult of Personality achievement guard";
      }
      if (!settings.foreignUnification && !guardActive("guardPacifist")) {
        return "Unification disabled";
      }
    }

    // If user wants to stabilize blackhole then do it, unless we're on blackhole run
    if (itemId === "tech-stabilize_blackhole") {
      if (!settings.prestigeWhiteholeStabiliseMass) {
        return "Blackhole stabilization disabled";
      }
      if (settings.prestigeType === "whitehole") {
        return "Disabled during whilehole reset";
      }
      if (
        settings.prestigeWhiteholeStabiliseCooldown > 0 &&
        state.whiteholeLastStabilise
      ) {
        let diff = (Date.now() - state.whiteholeLastStabilise) / 1000;
        if (diff < settings.prestigeWhiteholeStabiliseCooldown) {
          return `On cooldown for ${Math.ceil(
            settings.prestigeWhiteholeStabiliseCooldown - diff,
          )} more seconds`;
        }
      }
    }

    if (itemId === "tech-anthropology" || itemId === "tech-fanaticism") {
      if (guardActive("guardSecondEvolution")) {
        if (itemId === "tech-anthropology") {
          return "Second Evolution achievement guard";
        }
      } else if (itemId !== settings.userResearchTheology_1) {
        const isFanatRace = () =>
          Object.values(fanatAchievements).reduce(
            (result, combo) =>
              result ||
              (game.global.race.species === combo.race &&
                game.global.race.gods === combo.god &&
                !isAchievementUnlocked(combo.achieve, game.alevel())),
            false,
          );
        if (
          itemId === "tech-anthropology" &&
          !(
            settings.userResearchTheology_1 === "auto" &&
            settings.prestigeType === "mad" &&
            !isFanatRace()
          )
        ) {
          return "Undesirable theology path";
        }
        if (
          itemId === "tech-fanaticism" &&
          !(
            settings.userResearchTheology_1 === "auto" &&
            (settings.prestigeType !== "mad" || isFanatRace())
          )
        ) {
          return "Undesirable theology path";
        }
      }
    }

    if (
      itemId !== settings.userResearchTheology_2 &&
      (itemId === "tech-deify" || itemId === "tech-study")
    ) {
      let longRun = [
        "ascension",
        "demonic",
        "apotheosis",
        "apocalypse",
        "terraform",
        "matrix",
        "retire",
        "eden",
      ].includes(settings.prestigeType);
      if (
        itemId === "tech-deify" &&
        !(settings.userResearchTheology_2 === "auto" && longRun)
      ) {
        return "Undesirable theology path";
      }
      if (
        itemId === "tech-study" &&
        !(settings.userResearchTheology_2 === "auto" && !longRun)
      ) {
        return "Undesirable theology path";
      }
    }
    return false;
  }

  return { getTechConflict };
}
