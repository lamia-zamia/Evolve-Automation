import {
  createLoggingSettingsReadModel,
  type LoggingSettingsReadModel,
  type LoggingSettingsMessageType,
} from "../../domain/logging-settings.ts";
import { requireNonArrayRecord, requireString } from "../validation.ts";

interface LoggingSettingsEvolveDependencies {
  readonly getGame: () => unknown;
  readonly getGameLog: () => unknown;
  readonly getSettingsRaw: () => unknown;
}

export interface LoggingSettingsEvolveAdapter {
  readLoggingSettingsReadModel(): LoggingSettingsReadModel;
}

/** Maps volatile Evolve logger/game/settings values to a validated read model. */
export function createLoggingSettingsEvolveAdapter({
  getGame,
  getGameLog,
  getSettingsRaw,
}: LoggingSettingsEvolveDependencies): LoggingSettingsEvolveAdapter {
  function readLoggingSettingsReadModel(): LoggingSettingsReadModel {
    const game = requireNonArrayRecord(getGame(), "game");
    const global = requireNonArrayRecord(game["global"], "game.global");
    const gameSettings = requireNonArrayRecord(
      global["settings"],
      "game.global.settings",
    );
    const locale = requireString(
      gameSettings["locale"],
      "game.global.settings.locale",
    );
    const gameLog = requireNonArrayRecord(getGameLog(), "GameLog");
    const rawTypes = requireNonArrayRecord(gameLog["Types"], "GameLog.Types");
    const messageTypes: LoggingSettingsMessageType[] = [];
    for (const [id, rawLabel] of Object.entries(rawTypes)) {
      messageTypes.push({
        id,
        label: requireString(rawLabel, `GameLog.Types.${id}`),
      });
    }
    const settingsRaw = requireNonArrayRecord(getSettingsRaw(), "settingsRaw");
    const logFilter = requireString(
      settingsRaw["logFilter"],
      "settingsRaw.logFilter",
    );

    return createLoggingSettingsReadModel({
      messageTypes,
      locale,
      logFilter,
    });
  }

  return Object.freeze({ readLoggingSettingsReadModel });
}
