/** Reads Ejector game-panel toggle targets from the captured root and the live DOM. */

import type { EjectToggleItem } from "../../../../domain/economy/resources/eject-toggles.ts";
import type { EjectToggleReader } from "../../../../ports/eject-toggles.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { readCapturedEjectorSettingsEntries } from "./captured-ejector-settings-catalog.ts";
import { isRecord } from "../../../validation.ts";

interface CapturedEjectToggleDocument {
  getElementById(id: string): unknown;
}

export interface CapturedEjectToggleDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getDocument: () => CapturedEjectToggleDocument;
  readonly getSettingsRaw: () => unknown;
}

export function createCapturedEjectToggleReader({
  rootState,
  controls,
  getDocument,
  getSettingsRaw,
}: CapturedEjectToggleDependencies): EjectToggleReader {
  return Object.freeze({
    readItems(): readonly EjectToggleItem[] {
      const settings = getSettingsRaw();
      const entries = readCapturedEjectorSettingsEntries(
        rootState.readRoot(),
        controls,
      );
      return Object.freeze(
        entries
          .filter((entry) => {
            if (!entry.ejectConsumable) return false;
            const element = getDocument().getElementById(entry.ejectElementId);
            return element !== null && element !== undefined;
          })
          .map((entry) =>
            Object.freeze({
              resourceId: entry.resourceId,
              settingKey: `res_eject${entry.resourceId}`,
              enabled:
                isRecord(settings) &&
                settings[`res_eject${entry.resourceId}`] === true,
            }),
          ),
      );
    },
  });
}
