/** A captured action's private upstream grant is supplied by the pinned source manifest. */
import { readProperty } from "../../../validation.ts";
import { CAPTURED_GRANT_ACTIONS } from "./captured-grant-actions.generated.ts";

export interface CapturedGrantAction {
  readonly technology: string;
  readonly completedAtLevel: number;
  readonly legacyUnmanaged?: boolean;
}

export function readCapturedGrantAction(
  elementId: string,
): Readonly<CapturedGrantAction> | undefined {
  return Object.hasOwn(CAPTURED_GRANT_ACTIONS, elementId)
    ? CAPTURED_GRANT_ACTIONS[elementId]
    : undefined;
}

/** The game lazily omits an ungranted technology key; its numeric level is then zero. */
export function readCapturedGrantActionCount(
  root: unknown,
  grant: Readonly<CapturedGrantAction>,
): number | undefined {
  const tech = readProperty(root, "tech");
  if (tech === null || typeof tech !== "object" || Array.isArray(tech)) {
    return undefined;
  }
  const level = readProperty(tech, grant.technology);
  if (level === undefined) return 0;
  if (typeof level !== "number" || !Number.isFinite(level) || level < 0) {
    return undefined;
  }
  return level >= grant.completedAtLevel ? 1 : 0;
}
