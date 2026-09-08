/**
 * Job assignment through the controls captured while the upstream Civics panel was mounted.
 *
 * The Vue 3 game owns the worker movement: `add` and `sub` apply its current click multiplier and
 * update the live civic state. This adapter only paces the requested delta and refuses a control
 * that disappeared or was rebound between calls.
 */

import type {
  GameDefaultJobRequest,
  GameJobAssignmentRequest,
  GameJobControlsPort,
} from "../../../ports/game-job-controls.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";

export interface CapturedJobControlsDependencies {
  readonly controls: GameControlRegistry;
}

function callCount(
  controls: GameControlRegistry,
  elementId: string,
  method: "add" | "sub",
  count: number,
  craftedResourceId: string | undefined,
): boolean {
  const handle = controls.resolve(elementId);
  if (handle === undefined) return false;
  if (!Number.isFinite(count)) return false;
  const calls = Math.ceil(Math.max(count, 0));
  const args =
    craftedResourceId === undefined ? undefined : [craftedResourceId];
  for (let index = 0; index < calls; index++) {
    const result = controls.invoke(handle, method, args);
    if (!result.ok) return false;
  }
  return true;
}

export function createCapturedJobControls({
  controls,
}: CapturedJobControlsDependencies): GameJobControlsPort {
  return Object.freeze({
    assign({ elementId, count, craftedResourceId }: GameJobAssignmentRequest) {
      return callCount(controls, elementId, "add", count, craftedResourceId);
    },

    unassign({
      elementId,
      count,
      craftedResourceId,
    }: GameJobAssignmentRequest) {
      return callCount(controls, elementId, "sub", count, craftedResourceId);
    },

    setDefault({ elementId, jobId }: GameDefaultJobRequest) {
      const handle = controls.resolve(elementId);
      if (handle === undefined) return false;
      return controls.invoke(handle, "setDefault", [jobId]).ok;
    },
  });
}
