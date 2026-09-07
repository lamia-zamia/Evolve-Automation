/**
 * Sampling the live game world.
 *
 * Five independent capabilities, deliberately not one object: a feature injects the one it reads
 * and nothing else, and an implementation may back only the capability it can answer. The
 * sampling calls take the ids the caller needs so that no reader has to materialize the whole
 * world once per tick.
 *
 * Every reader answers `undefined` before the game has created its state.
 */

import type {
  GameIdentitySample,
  GameSettingsSample,
  RaceTraitSample,
  ResourceSample,
  TechSample,
} from "../domain/game-world.ts";

export interface GameIdentitySource {
  readIdentity(): GameIdentitySample | undefined;
}

export interface GameSettingsSource {
  readGameSettings(): GameSettingsSample | undefined;
}

export interface GameTechSource {
  /** Levels for exactly `ids`; an id the game has no entry for reports 0. */
  readTech(ids: Iterable<string>): TechSample | undefined;
}

export interface GameRaceTraitSource {
  /** Ranks for exactly `traits`; a trait the race does not have reports 0. */
  readRaceTraits(traits: Iterable<string>): RaceTraitSample | undefined;
}

export interface GameResourceSource {
  /** Views for exactly `ids`; an id that names no stored resource reports as absent. */
  readResources(ids: Iterable<string>): ResourceSample | undefined;
}
