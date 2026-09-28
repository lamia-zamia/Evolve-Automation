/**
 * The Moon's Test Launch is a one-shot space action, not a structure in `game.space`.
 * Upstream `spaceProjects.spc_home.test_launch.queue_complete()` is driven by `tech.space`, and its
 * `action()` grants Space II on success (DeadSpace reference `21166cc0`).
 */

import { readProperty } from "../../../validation.ts";

export const CAPTURED_TEST_LAUNCH = Object.freeze({
  elementId: "space-test_launch",
  completedAtSpaceLevel: 2,
});

/** Maps the game-owned Space technology level to the construction adapter's one-shot count. */
export function readCapturedTestLaunchCount(root: unknown): number | undefined {
  const spaceLevel = readProperty(readProperty(root, "tech"), "space");
  // `tech.space` is absent before Space I, when upstream cannot offer this action. A missing or
  // malformed level on a captured control is therefore unavailable, never an unfinished launch.
  if (
    typeof spaceLevel !== "number" ||
    !Number.isFinite(spaceLevel) ||
    spaceLevel < 1
  ) {
    return undefined;
  }
  return spaceLevel >= CAPTURED_TEST_LAUNCH.completedAtSpaceLevel ? 1 : 0;
}
