interface PrestigeLogSettings {
  prestigeType: string;
  log_prestige_format: string;
  stateLogEnabled: boolean;
  stateLogAutoDownload: boolean;
}

interface PrestigeLogGame {
  global: {
    stats: { days: number };
    race: { species: string };
  };
}

interface StateLogRecord extends Record<string, unknown> {
  species: string;
  reset: number;
  samples: unknown[];
}

interface PrestigeLogState {
  stateLog?: StateLogRecord;
}

interface PrestigeLogDependencies {
  getSettings: () => PrestigeLogSettings;
  getGame: () => PrestigeLogGame;
  getState: () => PrestigeLogState;
  getPrestigeTypes: () => { val: string; label: string }[];
  getGameLog: () => {
    logInfo(type: string, message: string, categories: string[]): void;
  };
  getFastEval: () => (expression: string) => unknown;
  getSaveStateLog: () => () => void;
  getTriggerFileDownload: () => (contents: string, filename: string) => void;
}

export function createPrestigeLog({
  getSettings,
  getGame,
  getState,
  getPrestigeTypes,
  getGameLog,
  getFastEval,
  getSaveStateLog,
  getTriggerFileDownload,
}: PrestigeLogDependencies) {
  function formatLogString(
    logString: string,
    replacements: Record<string, unknown>,
  ) {
    const fastEval = getFastEval();
    logString = logString.replace(
      /\{eval:([^}]+)\}/g,
      (match, evalString: string) => {
        try {
          return fastEval(evalString) as string;
        } catch {
          return match;
        }
      },
    );

    return logString.replace(
      /{(\w+)}/g,
      (placeholderWithDelimiters, placeholderWithoutDelimiters: string) =>
        Object.prototype.hasOwnProperty.call(
          replacements,
          placeholderWithoutDelimiters,
        )
          ? (replacements[placeholderWithoutDelimiters] as string)
          : placeholderWithDelimiters,
    );
  }

  function logPrestige() {
    const settings = getSettings();
    const game = getGame();
    const state = getState();
    const placeholders: Record<string, string | number> = {};
    placeholders.resetType = getPrestigeTypes().find(
      (prestige) => prestige.val === settings.prestigeType,
    )!.label;
    placeholders.timeStamp = game.global.stats.days;
    placeholders.species =
      game.global.race.species.charAt(0).toUpperCase() +
      game.global.race.species.slice(1);

    getGameLog().logInfo(
      "prestige",
      formatLogString(settings.log_prestige_format, placeholders),
      ["achievements"],
    );

    if (settings.stateLogEnabled && state.stateLog?.samples.length) {
      getSaveStateLog()();
      if (settings.stateLogAutoDownload) {
        const stateLog = state.stateLog;
        getTriggerFileDownload()(
          JSON.stringify(stateLog),
          `evolve-statelog-${stateLog.species}-r${stateLog.reset}-d${game.global.stats.days}.json`,
        );
      }
    }
  }

  return { formatLogString, logPrestige };
}
