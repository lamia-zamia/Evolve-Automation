import {
  createLoggingSettingsReadModel,
  type LoggingSettingsReadModel,
  type LoggingSettingsMessageType,
} from "../../domain/logging-settings.ts";
import { requireRecord } from "../validation.ts";

interface LoggingSettingsEvolveDependencies {
  readonly getGame: () => unknown;
  readonly getGameLog: () => unknown;
  readonly getSettingsRaw: () => unknown;
}

export interface LoggingSettingsEvolveAdapter {
  readLoggingSettingsReadModel(): LoggingSettingsReadModel;
}

function requireObjectRecord(value: unknown, path: string) {
  if (Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return requireRecord(value, path);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

/** Maps volatile Evolve logger/game/settings values to a validated read model. */
export function createLoggingSettingsEvolveAdapter({
  getGame,
  getGameLog,
  getSettingsRaw,
}: LoggingSettingsEvolveDependencies): LoggingSettingsEvolveAdapter {
  function readLoggingSettingsReadModel(): LoggingSettingsReadModel {
    const game = requireObjectRecord(getGame(), "game");
    const global = requireObjectRecord(game["global"], "game.global");
    const gameSettings = requireObjectRecord(
      global["settings"],
      "game.global.settings",
    );
    const locale = requireString(
      gameSettings["locale"],
      "game.global.settings.locale",
    );
    const gameLog = requireObjectRecord(getGameLog(), "GameLog");
    const rawTypes = requireObjectRecord(gameLog["Types"], "GameLog.Types");
    const messageTypes: LoggingSettingsMessageType[] = [];
    for (const [id, rawLabel] of Object.entries(rawTypes)) {
      messageTypes.push({
        id,
        label: requireString(rawLabel, `GameLog.Types.${id}`),
      });
    }
    const settingsRaw = requireObjectRecord(getSettingsRaw(), "settingsRaw");
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
