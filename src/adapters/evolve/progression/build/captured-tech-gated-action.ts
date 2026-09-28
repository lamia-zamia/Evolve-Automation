/**
 * Completion metadata for captured one-shot game actions that have no region count.
 *
 * DeadSpace keeps `queue_complete()` on private project definitions rather than captured controls.
 * These two space projects expose the same completion contract through `tech.space`:
 * `spaceProjects.spc_home.test_launch` completes at Space II and
 * `spaceProjects.spc_moon.moon_mission` completes at Space III (reference `6cc9ba8c`).
 * The shared reader below maps that game-owned level to the build executor's one-shot count.
 */

import { readProperty } from "../../../validation.ts";

export interface CapturedTechGatedAction {
  readonly technology: string;
  readonly availableAtLevel: number;
  readonly completedAtLevel: number;
}

export const CAPTURED_TECH_GATED_ACTIONS: Readonly<
  Record<string, Readonly<CapturedTechGatedAction>>
> = Object.freeze({
  "space-test_launch": Object.freeze({
    technology: "space",
    availableAtLevel: 1,
    completedAtLevel: 2,
  }),
  "space-moon_mission": Object.freeze({
    technology: "space",
    availableAtLevel: 2,
    completedAtLevel: 3,
  }),
});

export function readCapturedTechGatedActionRule(
  elementId: string,
): Readonly<CapturedTechGatedAction> | undefined {
  return Object.hasOwn(CAPTURED_TECH_GATED_ACTIONS, elementId)
    ? CAPTURED_TECH_GATED_ACTIONS[elementId]
    : undefined;
}

/** Maps a game technology progression level to the build adapter's zero-or-one action count. */
export function readCapturedTechGatedActionCount(
  root: unknown,
  rule: Readonly<CapturedTechGatedAction>,
): number | undefined {
  const level = readProperty(readProperty(root, "tech"), rule.technology);
  // Lazily absent technology levels remain unavailable until the upstream action is unlocked.
  if (
    typeof level !== "number" ||
    !Number.isFinite(level) ||
    level < rule.availableAtLevel
  ) {
    return undefined;
  }
  return level >= rule.completedAtLevel ? 1 : 0;
}
