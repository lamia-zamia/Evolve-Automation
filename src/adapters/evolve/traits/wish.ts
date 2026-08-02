import type {
  WishInput,
  WishSelectionDecision,
  WishTier,
} from "../../../domain/traits/wish.ts";
import type { DecisionExecutor } from "../../../ports/decision-executor.ts";
import type { WishControls, WishReader } from "../../../ports/wish.ts";
import { rejected, stale, SUCCEEDED } from "../../command-outcomes.ts";
import {
  requireNumber,
  requireRecord,
  requireString,
} from "../../validation.ts";

export interface WishReaderDependencies {
  readonly getGame: () => unknown;
  readonly getSettings: () => unknown;
}

function readTechnologyLevel(technology: Record<PropertyKey, unknown>): number {
  const value = technology["wish"];
  if (value === undefined || value === null || value === 0) return 0;
  return requireNumber(value, "game.global.tech.wish");
}

function readWishState(gameValue: unknown): {
  readonly race: Record<PropertyKey, unknown>;
  readonly technologyLevel: number;
} {
  const game = requireRecord(gameValue, "game");
  const global = requireRecord(game["global"], "game.global");
  const race = requireRecord(global["race"], "game.global.race");
  if (!race["wish"]) {
    return Object.freeze({ race, technologyLevel: 0 });
  }
  const technology = requireRecord(global["tech"], "game.global.tech");
  return Object.freeze({
    race,
    technologyLevel: readTechnologyLevel(technology),
  });
}

export function createWishReader(
  dependencies: WishReaderDependencies,
): WishReader {
  return Object.freeze({
    read(): WishInput {
      const { race, technologyLevel } = readWishState(dependencies.getGame());
      if (!race["wish"] || technologyLevel === 0) {
        return Object.freeze({
          unlocked: false,
          technologyLevel,
          minorRemaining: 0,
          majorRemaining: 0,
          minorSelection: "none",
          majorSelection: "none",
        });
      }

      const wishStats = requireRecord(
        race["wishStats"],
        "game.global.race.wishStats",
      );
      const minorRemaining = requireNumber(
        wishStats["minor"],
        "game.global.race.wishStats.minor",
      );
      const majorRemaining =
        technologyLevel >= 2
          ? requireNumber(
              wishStats["major"],
              "game.global.race.wishStats.major",
            )
          : 0;
      let settings: Record<PropertyKey, unknown> | null = null;
      const getSettings = () => {
        settings ??= requireRecord(dependencies.getSettings(), "settings");
        return settings;
      };
      const minorSelection =
        minorRemaining === 0
          ? requireString(getSettings()["wishMinor"], "settings.wishMinor")
          : "none";
      const majorSelection =
        technologyLevel >= 2 && majorRemaining === 0
          ? requireString(getSettings()["wishMajor"], "settings.wishMajor")
          : "none";
      return Object.freeze({
        unlocked: true,
        technologyLevel,
        minorRemaining,
        majorRemaining,
        minorSelection,
        majorSelection,
      });
    },
  });
}

function readRemaining(
  race: Record<PropertyKey, unknown>,
  tier: WishTier,
): number {
  const wishStats = requireRecord(
    race["wishStats"],
    "game.global.race.wishStats",
  );
  return requireNumber(wishStats[tier], `game.global.race.wishStats.${tier}`);
}

export function createWishCommandExecutor(dependencies: {
  readonly getGame: () => unknown;
  readonly controls: WishControls;
}): DecisionExecutor<WishSelectionDecision> {
  return Object.freeze({
    execute(decision: Readonly<WishSelectionDecision>) {
      if (
        (decision.tier !== "minor" && decision.tier !== "major") ||
        typeof decision.wishId !== "string" ||
        decision.expectedRemaining !== 0
      ) {
        return rejected(
          "invalid-wish-selection",
          "wish selection must identify a tier, setting id, and zero precondition",
        );
      }
      const { race, technologyLevel } = readWishState(dependencies.getGame());
      if (!race["wish"] || technologyLevel === 0) {
        return stale("wish-locked", "wish selection became unavailable");
      }
      if (decision.tier === "major" && technologyLevel < 2) {
        return stale("major-wish-locked", "major wish became unavailable");
      }
      const actualRemaining = readRemaining(race, decision.tier);
      if (actualRemaining !== decision.expectedRemaining) {
        return stale("wish-already-selected", "wish was already selected", {
          tier: decision.tier,
          expected: decision.expectedRemaining,
          actual: actualRemaining,
        });
      }
      if (!dependencies.controls.select(decision.tier, decision.wishId)) {
        return stale(
          "wish-controls-unavailable",
          `${decision.tier} wish controls became unavailable`,
        );
      }
      return SUCCEEDED;
    },
  });
}
