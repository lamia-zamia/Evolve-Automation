export interface EvolutionResultSettings {
  masterScriptToggle: boolean;
  autoEvolution: boolean;
  evolutionBackup: boolean;
  userEvolutionTarget: string;
  autoMutateTraits: boolean;
  evolutionQueueEnabled: boolean;
  evolutionQueueRepeat: boolean;
  [key: string]: unknown;
}

export interface EvolutionResultSettingsRaw {
  evolutionQueue: unknown[];
  [key: string]: unknown;
}

export interface EvolutionResultState {
  evoCheckNeeded?: boolean;
  goal?: string;
  [key: string]: unknown;
}

export interface EvolutionResultGame {
  global: { race: Record<string, unknown> & { species: string } };
  races: Record<string, { traits: Record<string, unknown> }>;
  loc: (key: string) => string;
}

/** Script-side race model (`races` in main.js), not the game's own race data. */
export interface EvolutionResultRace {
  name: string;
  /** Returns the numeric weighting, or the list of achievement goals when asked. */
  getWeighting: {
    (): number;
    (returnGoals: true): string[];
  };
  getHabitability: () => number;
}

export interface EvolutionResultTrait {
  traitName: string;
  name: string;
  resetEnabled: boolean;
}

export interface EvolutionResultGameLog {
  logDanger: (type: string, message: string, tags: string[]) => void;
  logWarning: (type: string, message: string, tags: string[]) => void;
  logInfo: (type: string, message: string, tags: string[]) => void;
}

export interface EvolutionResultResetButton {
  innerText: string;
  disabled: boolean;
  click: () => void;
}

export interface EvolutionResultDependencies {
  getSettings: () => EvolutionResultSettings;
  getSettingsRaw: () => EvolutionResultSettingsRaw;
  getState: () => EvolutionResultState;
  getGame: () => EvolutionResultGame;
  getRaces: () => Record<string, EvolutionResultRace>;
  getMutableTraitManager: () => { priorityList: EvolutionResultTrait[] };
  getGameLog: () => EvolutionResultGameLog;
  getDocument: () => {
    querySelector: (selector: string) => EvolutionResultResetButton;
  };
  getAddEvolutionSetting: () => () => void;
  getUpdateSettingsFromState: () => () => void;
}

/** Species that can only be evolved intentionally, never as a random evolution result. */
const INTENTIONAL_SPECIES = ["junker", "sludge", "ultra_sludge", "hellspawn"];

export function createEvolutionResult({
  getSettings,
  getSettingsRaw,
  getState,
  getGame,
  getRaces,
  getMutableTraitManager,
  getGameLog,
  getDocument,
  getAddEvolutionSetting,
  getUpdateSettingsFromState,
}: EvolutionResultDependencies) {
  /**
   * Runs once per evolution: decides whether the race we ended up with is acceptable,
   * and soft resets to try again if it is not. Returns false when a reset was
   * triggered, meaning the caller must abandon the current tick.
   */
  function checkEvolutionResult(): boolean {
    const settings = getSettings();
    const state = getState();
    if (!settings.masterScriptToggle || !state.evoCheckNeeded) {
      return true;
    }
    state.evoCheckNeeded = false;

    const game = getGame();
    const races = getRaces();
    const GameLog = getGameLog();

    let needReset = false;
    if (settings.autoEvolution && settings.evolutionBackup) {
      // Sludge and Valdi can't be evolved at random, only intentionally
      if (!INTENTIONAL_SPECIES.includes(game.global.race.species)) {
        if (settings.userEvolutionTarget === "auto") {
          const newRace = races[game.global.race.species];
          if (newRace.getWeighting() <= 0) {
            const bestWeighting = Math.max(
              ...Object.values(races).map((r) => r.getWeighting()),
            );
            if (bestWeighting > 0) {
              GameLog.logDanger(
                "special",
                `${newRace.name} have no unearned achievements for current prestige, soft resetting and trying again.`,
                ["progress", "achievements"],
              );
              needReset = true;
            } else {
              GameLog.logWarning(
                "special",
                `Can't pick a race with unearned achievements for current prestige. Continuing with ${newRace.name}.`,
                ["progress", "achievements"],
              );
            }
          }
        } else if (
          settings.userEvolutionTarget !== game.global.race.species &&
          races[settings.userEvolutionTarget].getHabitability() > 0
        ) {
          GameLog.logDanger(
            "special",
            `Wrong race, soft resetting and trying again.`,
            ["progress"],
          );
          needReset = true;
        }
      }
    }
    if (settings.autoMutateTraits) {
      const baseRace = game.races[game.global.race.species];
      for (const trait of getMutableTraitManager().priorityList) {
        if (
          trait.resetEnabled &&
          game.global.race[trait.traitName] &&
          !baseRace.traits[trait.traitName]
        ) {
          GameLog.logDanger(
            "special",
            `Gained ${trait.name} trait, soft resetting and trying again.`,
            ["progress"],
          );
          needReset = true;
          break;
        }
      }
    }

    if (
      !needReset &&
      settings.autoEvolution &&
      settings.userEvolutionTarget === "auto"
    ) {
      const goals = races[game.global.race.species].getWeighting(true);
      if (goals.length > 0) {
        GameLog.logInfo(
          "special",
          `Auto Achievement goes for: ${goals
            .map((s) => game.loc(s))
            .join(", ")}.`,
          ["progress", "achievements"],
        );
      } else {
        GameLog.logInfo(
          "special",
          `Auto Achievement can't pick a goal for this run.`,
          ["progress", "achievements"],
        );
      }
    }

    if (needReset) {
      // Let's double check it's actually *soft* reset
      const resetButton = getDocument().querySelector(
        ".reset .button:not(.right)",
      );
      if (resetButton.innerText === game.loc("reset_soft")) {
        const settingsRaw = getSettingsRaw();
        if (
          settings.evolutionQueueEnabled &&
          settingsRaw.evolutionQueue.length > 0
        ) {
          if (!settings.evolutionQueueRepeat) {
            getAddEvolutionSetting()();
          }
          settingsRaw.evolutionQueue.unshift(settingsRaw.evolutionQueue.pop());
        }
        getUpdateSettingsFromState()();

        state.goal = "GameOverMan";
        resetButton.disabled = false;
        resetButton.click();
        return false;
      }
    }
    return true;
  }

  return { checkEvolutionResult };
}
