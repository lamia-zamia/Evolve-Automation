/** Reads Building game-panel toggle targets from captured controls and the live DOM. */

import type { BuildingToggleItem } from "../../../../domain/progression/build/building-toggles.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import type { BuildingToggleReader } from "../../../../ports/building-toggles.ts";
import { readCapturedBuildingEntries } from "./captured-building-catalog.ts";
import { isRecord } from "../../../validation.ts";

interface CapturedBuildingToggleDocument {
  getElementById(id: string): unknown;
}

export interface CapturedBuildingToggleDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getDocument: () => CapturedBuildingToggleDocument;
  readonly getSettingsRaw: () => unknown;
  readonly ensureControls?: () => void;
}

export function createCapturedBuildingToggleReader({
  rootState,
  controls,
  getDocument,
  getSettingsRaw,
  ensureControls,
}: CapturedBuildingToggleDependencies): BuildingToggleReader {
  return Object.freeze({
    readVisible(): boolean {
      const panel = getDocument().getElementById("mTabCivil");
      return panel !== null && panel !== undefined;
    },
    readItems(): readonly BuildingToggleItem[] {
      ensureControls?.();
      const settings = getSettingsRaw();
      const entries = readCapturedBuildingEntries(
        rootState.readRoot(),
        controls,
      );
      return Object.freeze(
        entries
          .filter((entry) => {
            const element = getDocument().getElementById(entry.elementId);
            return element !== null && element !== undefined;
          })
          .map((entry) =>
            Object.freeze({
              binding: entry.binding,
              elementId: entry.elementId,
              settingKey: `bat${entry.binding}`,
              enabled:
                isRecord(settings) && settings[`bat${entry.binding}`] === true,
            }),
          ),
      );
    },
  });
}
