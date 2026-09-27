import { numberSuffix } from "../../../config.ts";
import { createNumberFormatting } from "../../../formatting/numbers.ts";
import {
  bestDesignFigures,
  rateMechDesign,
} from "../../../domain/combat/mech-design.ts";
import { formatMechInfo } from "../../../domain/combat/mech-info.ts";
import { readCapturedMechRatingFloor } from "../../../domain/combat/mech-auto-choice.ts";
import { readCapturedMechState } from "../../../domain/combat/mech-state.ts";
import type { MechInfoReader } from "../../../ports/mech-info.ts";
import type { GameKeyStateReader } from "../../../ports/game-key-state.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { readCapturedMechQueueKeyHeld } from "./captured-mech.ts";
import { readProperty } from "../../validation.ts";

export interface CapturedMechInfoReaderDependencies {
  readonly rootState: GameRootStateSource;
  readonly readSettings: () => unknown;
  readonly keyState: GameKeyStateReader;
  readonly ensureLabActive: () => boolean;
}

const capturedMechInfoFormatting = createNumberFormatting({ numberSuffix });
const capturedMechInfoNumber = (amountValue: number): string =>
  String(capturedMechInfoFormatting.getNumberString(amountValue));

export function createCapturedMechInfoReader({
  rootState,
  readSettings,
  keyState,
  ensureLabActive,
}: CapturedMechInfoReaderDependencies): MechInfoReader {
  return Object.freeze({
    ensureLabActive,

    readItems(count: number) {
      if (!Number.isSafeInteger(count) || count <= 0) {
        return Object.freeze([]);
      }
      const root = rootState.readRoot();
      const state = readCapturedMechState({
        root,
        settings: readSettings(),
        queueKeyHeld: readCapturedMechQueueKeyHeld(
          readProperty(root, "settings"),
          keyState,
        ),
      });
      if (!state?.available || state.spire === null) {
        return Object.freeze(new Array(count).fill(undefined));
      }
      const floor = readCapturedMechRatingFloor(state);
      if (floor === null) {
        return Object.freeze(new Array(count).fill(undefined));
      }
      // Collector power is normalized to one here because formatMechInfo applies the saved
      // collector value to the displayed production rate after calculating its relative rating.
      const ratingFloor = Object.freeze({ ...floor, collectorValue: 1 });
      const bestFigures = bestDesignFigures(ratingFloor, () => 0);
      if (bestFigures === null) {
        return Object.freeze(new Array(count).fill(undefined));
      }

      const designs = new Map(
        state.inventory.map((design) => [design.index, design] as const),
      );
      return Object.freeze(
        Array.from({ length: count }, (_, index) => {
          const design = designs.get(index);
          if (design === undefined) return undefined;
          const rating = rateMechDesign(design, ratingFloor);
          const bestPower = bestFigures[design.size]?.power;
          if (
            rating === null ||
            bestPower === undefined ||
            !Number.isFinite(rating.power) ||
            !Number.isFinite(rating.efficiency) ||
            !Number.isFinite(bestPower) ||
            bestPower <= 0
          ) {
            return undefined;
          }
          return Object.freeze({
            text: formatMechInfo(
              {
                size: design.size,
                power: rating.power,
                efficiency: rating.efficiency,
                bestPower,
                ...(design.size === "collector"
                  ? { collectorValue: state.settings.collectorValue }
                  : {}),
              },
              capturedMechInfoNumber,
            ),
          });
        }),
      );
    },
  });
}
