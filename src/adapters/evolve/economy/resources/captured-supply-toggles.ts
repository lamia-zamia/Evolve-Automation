/** Reads Supply game-panel toggle targets from the captured root and the live DOM. */

import type { SupplyToggleItem } from "../../../../domain/economy/resources/supply-toggles.ts";
import type { SupplyToggleReader } from "../../../../ports/supply-toggles.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { readCapturedEjectorSettingsEntries } from "./captured-ejector-settings-catalog.ts";
import { isRecord } from "../../../validation.ts";

interface CapturedSupplyToggleDocument {
  getElementById(id: string): unknown;
}

export interface CapturedSupplyToggleDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getDocument: () => CapturedSupplyToggleDocument;
  readonly getSettingsRaw: () => unknown;
}

export function createCapturedSupplyToggleReader({
  rootState,
  controls,
  getDocument,
  getSettingsRaw,
}: CapturedSupplyToggleDependencies): SupplyToggleReader {
  return Object.freeze({
    readItems(): readonly SupplyToggleItem[] {
      const settings = getSettingsRaw();
      const entries = readCapturedEjectorSettingsEntries(
        rootState.readRoot(),
        controls,
      );
      return Object.freeze(
        entries
          .filter((entry) => {
            if (!entry.supplyConsumable) return false;
            const element = getDocument().getElementById(entry.supplyElementId);
            return element !== null && element !== undefined;
          })
          .map((entry) =>
            Object.freeze({
              resourceId: entry.resourceId,
              settingKey: `res_supply${entry.resourceId}`,
              enabled:
                isRecord(settings) &&
                settings[`res_supply${entry.resourceId}`] === true,
            }),
          ),
      );
    },
  });
}
