import type { GameControlHandle } from "../../ports/game-control-registry.ts";
import { isRecord, readProperty } from "../validation.ts";

/**
 * Reads the label the game already resolved for one captured action.
 *
 * DeadSpace binds each action with `{ title, act }` data. The title is already localized and
 * reflects dynamic names such as the current race or event, so activity logging must use it rather
 * than reconstructing a label from an element id. A missing title is a capture gap, not a reason
 * to prevent the confirmed state transition from being reported.
 */
export function readCapturedControlLabel(
  handle: Readonly<GameControlHandle>,
  fallback: string,
): string {
  const data = handle.data;
  if (!isRecord(data)) return fallback;
  const title = readProperty(data, "title");
  return typeof title === "string" && title.trim().length > 0
    ? title
    : fallback;
}
