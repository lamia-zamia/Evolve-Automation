/**
 * Projects the captured `game.arpa` record into the Project settings catalog.
 *
 * DeadSpace draws one `#arpa<id>` div per offered project under `#arpaPhysics`
 * (`src/arpa.js` `drawProjects`), and binds each through the same capture that
 * feeds the control registry — so the element id is `arpa` followed by the
 * project id, exactly as the condition operands already assume. The settings
 * table lists every project the root record knows (minus the `sequence`
 * subsystem), whether or not the game is currently offering it, with the
 * game's own bound title where a control is captured and the raw id otherwise.
 * No manager, entity bridge, or compatibility object is consulted.
 */

import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import { readCapturedControlLabel } from "../../captured-control-label.ts";
import { isRecord, readProperty } from "../../../validation.ts";

export interface CapturedProjectSettingsEntry {
  readonly projectId: string;
  readonly elementId: string;
  readonly label: string;
}

/** The `sequence` key is a subsystem flag, not a buildable project. */
const NON_PROJECT_ARPA_KEY = "sequence";

export function readCapturedProjectSettingsEntries(
  root: unknown,
  controls: GameControlRegistry,
): readonly Readonly<CapturedProjectSettingsEntry>[] {
  const arpa = readProperty(root, "arpa");
  if (!isRecord(arpa)) return Object.freeze([]);
  const entries: CapturedProjectSettingsEntry[] = [];
  for (const projectId of Object.keys(arpa)) {
    if (projectId === NON_PROJECT_ARPA_KEY || projectId.length === 0) continue;
    const elementId = `arpa${projectId}`;
    const handle = controls.resolve(elementId);
    entries.push(
      Object.freeze({
        projectId,
        elementId,
        label:
          handle === undefined
            ? projectId
            : readCapturedControlLabel(handle, projectId),
      }),
    );
  }
  return Object.freeze(entries);
}
