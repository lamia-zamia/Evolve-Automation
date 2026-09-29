import type {
  WishInput,
  WishSelectionDecision,
  WishTier,
} from "../../../domain/traits/wish.ts";
import type { DecisionExecutor } from "../../../ports/decision-executor.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import type { WishControls, WishReader } from "../../../ports/wish.ts";
import {
  CAPTURED_TRAIT_WISH_MAJOR,
  CAPTURED_TRAIT_WISH_MINOR,
} from "./captured-trait-settings-catalog.ts";
import { stale, SUCCEEDED } from "../../command-outcomes.ts";
import {
  finite,
  isRecord,
  readProperty,
  requireRecord,
  requireString,
} from "../../validation.ts";

export const CAPTURED_WISH_CONTROLS = Object.freeze({
  minor: "minorWish",
  major: "majorWish",
});

export interface CapturedWishDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly ensureControls: (tier: WishTier, wishId: string) => boolean;
}

function capturedWishState(rootState: GameRootStateSource): {
  readonly race: Record<PropertyKey, unknown>;
  readonly technologyLevel: number;
} {
  const root = rootState.readRoot();
  const race = requireRecord(readProperty(root, "race"), "global.race");
  const technology = readProperty(root, "tech");
  const rawLevel = readProperty(technology, "wish");
  return Object.freeze({
    race,
    technologyLevel:
      rawLevel === undefined || rawLevel === null || rawLevel === 0
        ? 0
        : (finite(rawLevel) ?? 0),
  });
}

function capturedWishRemaining(
  race: Record<PropertyKey, unknown>,
  tier: WishTier,
): number | undefined {
  const stats = readProperty(race, "wishStats");
  return isRecord(stats) ? finite(readProperty(stats, tier)) : undefined;
}

function capturedWishCatalogMethod(
  tier: WishTier,
  id: string,
): string | undefined {
  const catalog =
    tier === "minor" ? CAPTURED_TRAIT_WISH_MINOR : CAPTURED_TRAIT_WISH_MAJOR;
  return catalog.find((wish) => wish.id === id)?.method;
}

export function createCapturedWishAutomation(
  dependencies: CapturedWishDependencies,
): {
  readonly reader: WishReader;
  readonly controls: WishControls;
  readonly executor: DecisionExecutor<WishSelectionDecision>;
} {
  const reader: WishReader = Object.freeze({
    read(): WishInput {
      const { race, technologyLevel } = capturedWishState(
        dependencies.rootState,
      );
      if (!readProperty(race, "wish") || technologyLevel <= 0) {
        return Object.freeze({
          unlocked: false,
          technologyLevel,
          minorRemaining: 0,
          majorRemaining: 0,
          minorSelection: "none",
          majorSelection: "none",
        });
      }
      const minorRemaining = capturedWishRemaining(race, "minor");
      const majorRemaining =
        technologyLevel >= 2 ? capturedWishRemaining(race, "major") : 0;
      if (minorRemaining === undefined || majorRemaining === undefined) {
        return Object.freeze({
          unlocked: false,
          technologyLevel,
          minorRemaining: 0,
          majorRemaining: 0,
          minorSelection: "none",
          majorSelection: "none",
        });
      }
      const settings = requireRecord(dependencies.readSettings(), "settings");
      return Object.freeze({
        unlocked: true,
        technologyLevel,
        minorRemaining,
        majorRemaining,
        minorSelection:
          minorRemaining === 0
            ? requireString(settings["wishMinor"], "settings.wishMinor")
            : "none",
        majorSelection:
          technologyLevel >= 2 && majorRemaining === 0
            ? requireString(settings["wishMajor"], "settings.wishMajor")
            : "none",
      });
    },
  });

  const controls: WishControls = Object.freeze({
    select(tier: WishTier, wishId: string): boolean {
      if (!dependencies.ensureControls(tier, wishId)) return false;
      const controlId =
        tier === "minor"
          ? CAPTURED_WISH_CONTROLS.minor
          : CAPTURED_WISH_CONTROLS.major;
      const method = capturedWishCatalogMethod(tier, wishId);
      const handle = dependencies.controls.resolve(controlId);
      if (
        method === undefined ||
        handle === undefined ||
        !handle.methods.includes(method)
      ) {
        return false;
      }
      return dependencies.controls.invoke(handle, method).ok;
    },
  });

  const executor: DecisionExecutor<WishSelectionDecision> = Object.freeze({
    execute(wishSelection: Readonly<WishSelectionDecision>) {
      if (
        (wishSelection.tier !== "minor" && wishSelection.tier !== "major") ||
        wishSelection.expectedRemaining !== 0 ||
        capturedWishCatalogMethod(wishSelection.tier, wishSelection.wishId) ===
          undefined
      ) {
        return stale("wish-decision-invalid", "wish selection is unavailable");
      }
      const { race, technologyLevel } = capturedWishState(
        dependencies.rootState,
      );
      if (!readProperty(race, "wish") || technologyLevel <= 0) {
        return stale("wish-locked", "wish selection became unavailable");
      }
      if (wishSelection.tier === "major" && technologyLevel < 2) {
        return stale("major-wish-locked", "major wish became unavailable");
      }
      if (capturedWishRemaining(race, wishSelection.tier) !== 0) {
        return stale("wish-already-selected", "wish was already selected");
      }
      controls.select(wishSelection.tier, wishSelection.wishId);
      const { race: updatedRace } = capturedWishState(dependencies.rootState);
      return (capturedWishRemaining(updatedRace, wishSelection.tier) ?? 0) > 0
        ? SUCCEEDED
        : stale(
            "wish-postcondition-failed",
            `the game did not apply the ${wishSelection.tier} wish`,
          );
    },
  });

  return Object.freeze({ reader, controls, executor });
}
