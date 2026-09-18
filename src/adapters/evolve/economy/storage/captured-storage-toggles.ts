/** Reads Storage game-panel toggle targets from the captured root and the live DOM. */

import type { StorageToggleView } from "../../../../domain/economy/resources/resource-toggles.ts";
import type { StorageToggleReader } from "../../../../ports/resource-toggles.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { readCapturedStorageSettingsEntries } from "./captured-storage-settings-catalog.ts";
import { isRecord } from "../../../validation.ts";

interface CapturedStorageToggleDocument {
  getElementById(id: string): unknown;
}

export interface CapturedStorageToggleDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getDocument: () => CapturedStorageToggleDocument;
  readonly getSettingsRaw: () => unknown;
}

export function createCapturedStorageToggleReader({
  rootState,
  controls,
  getDocument,
  getSettingsRaw,
}: CapturedStorageToggleDependencies): StorageToggleReader {
  return Object.freeze({
    readStorage(): StorageToggleView {
      const settings = getSettingsRaw();
      const entries = readCapturedStorageSettingsEntries(
        rootState.readRoot(),
        controls,
      );
      return Object.freeze({
        items: Object.freeze(
          entries
            .filter((entry) => {
              const element = getDocument().getElementById(entry.elementId);
              return element !== null && element !== undefined;
            })
            .map((entry) =>
              Object.freeze({
                resourceId: entry.resourceId,
                storeKey: `res_storage${entry.resourceId}`,
                overKey: `res_storage_o_${entry.resourceId}`,
                storeEnabled:
                  isRecord(settings) &&
                  settings[`res_storage${entry.resourceId}`] === true,
                overEnabled:
                  isRecord(settings) &&
                  settings[`res_storage_o_${entry.resourceId}`] === true,
              }),
            ),
        ),
      });
    },
  });
}
