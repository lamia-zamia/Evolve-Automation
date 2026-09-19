/**
 * Projects the captured storage resources into the Storage settings catalog.
 *
 * DeadSpace draws one `#stack-<id>` row per storable resource under
 * `#resStorage` (`src/resources.js` `drawStorage`), so the element id is
 * `stack-` followed by the resource id. The catalog is the same resource list
 * the lifecycle defaults are computed from, with the game's own root title
 * where the record carries one and the raw id otherwise. No manager, entity
 * bridge, or compatibility object is consulted.
 */

import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import { readStorageResetContext } from "../../captured-settings-defaults.ts";
import { readCapturedResourceLabel } from "../../captured-resource-metadata.ts";

export interface CapturedStorageSettingsEntry {
  readonly resourceId: string;
  readonly elementId: string;
  readonly label: string;
}

export function readCapturedStorageSettingsEntries(
  root: unknown,
  controls: GameControlRegistry,
): readonly Readonly<CapturedStorageSettingsEntry>[] {
  const { storableResourceIds } = readStorageResetContext(root, controls);
  return Object.freeze(
    storableResourceIds.map((resourceId) =>
      Object.freeze({
        resourceId,
        elementId: `stack-${resourceId}`,
        label: readCapturedResourceLabel(root, resourceId),
      }),
    ),
  );
}
