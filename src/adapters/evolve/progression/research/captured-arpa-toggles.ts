/** Reads A.R.P.A. game-panel toggle targets from the captured root and the live DOM. */

import type { ArpaToggleItem } from "../../../../domain/progression/research/arpa-toggles.ts";
import type { ArpaToggleReader } from "../../../../ports/arpa-toggles.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { readCapturedProjectSettingsEntries } from "./captured-project-settings-catalog.ts";
import { isRecord } from "../../../validation.ts";

interface CapturedArpaToggleDocument {
  getElementById(id: string): unknown;
}

export interface CapturedArpaToggleDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getDocument: () => CapturedArpaToggleDocument;
  readonly getSettingsRaw: () => unknown;
}

export function createCapturedArpaToggleReader({
  rootState,
  controls,
  getDocument,
  getSettingsRaw,
}: CapturedArpaToggleDependencies): ArpaToggleReader {
  return Object.freeze({
    readItems(): readonly ArpaToggleItem[] {
      const settings = getSettingsRaw();
      const entries = readCapturedProjectSettingsEntries(
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
              projectId: entry.projectId,
              settingKey: `arpa_${entry.projectId}`,
              enabled:
                isRecord(settings) &&
                settings[`arpa_${entry.projectId}`] === true,
            }),
          ),
      );
    },
  });
}
