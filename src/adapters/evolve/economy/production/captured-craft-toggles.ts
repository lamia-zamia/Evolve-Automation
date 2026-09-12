import type { CraftToggleItem } from "../../../../domain/economy/production/craft-toggles.ts";
import type { CraftToggleReader } from "../../../../ports/craft-toggles.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { isRecord, readProperty } from "../../../validation.ts";
import { CRAFT_ROW_PREFIX } from "./captured-craft-costs.ts";

interface CapturedCraftToggleDocument {
  getElementById(elementId: string): unknown;
}

export interface CapturedCraftToggleDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getDocument: () => CapturedCraftToggleDocument;
  readonly getSettingsRaw: () => unknown;
}

const CAPTURED_CRAFT_TOGGLE_BUTTON_PREFIX = "inc";
const CAPTURED_CRAFT_TOGGLE_BUTTON_SUFFIX = "A";

function capturedCraftToggleEnabled(
  settings: unknown,
  resourceId: string,
): boolean {
  return isRecord(settings) && settings[`craft${resourceId}`] === true;
}

function capturedCraftToggleButtonExists(
  getDocument: () => CapturedCraftToggleDocument,
  resourceId: string,
): boolean {
  const element = getDocument().getElementById(
    `${CAPTURED_CRAFT_TOGGLE_BUTTON_PREFIX}${resourceId}${CAPTURED_CRAFT_TOGGLE_BUTTON_SUFFIX}`,
  );
  return element !== null && element !== undefined;
}

/** Reads the craft rows the game has actually drawn, without copying its recipe catalog. */
export function createCapturedCraftToggleReader({
  rootState,
  controls,
  getDocument,
  getSettingsRaw,
}: CapturedCraftToggleDependencies): CraftToggleReader {
  return Object.freeze({
    readItems(): readonly CraftToggleItem[] {
      const resources = readProperty(rootState.readRoot(), "resource");
      if (!isRecord(resources)) return Object.freeze([]);

      const items: CraftToggleItem[] = [];
      for (const resourceId of Object.keys(resources)) {
        if (
          controls.resolve(`${CRAFT_ROW_PREFIX}${resourceId}`) === undefined ||
          !capturedCraftToggleButtonExists(getDocument, resourceId)
        ) {
          continue;
        }
        items.push(
          Object.freeze({
            craftableId: resourceId,
            settingKey: `craft${resourceId}`,
            enabled: capturedCraftToggleEnabled(getSettingsRaw(), resourceId),
          }),
        );
      }
      return Object.freeze(items);
    },
  });
}
