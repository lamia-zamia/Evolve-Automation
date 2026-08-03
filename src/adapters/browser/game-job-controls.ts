// TRANSITIONAL: the Vue 2 civics tab renders every job control as its own
// element whose component exposes `add()` and `sub()`, and exposes the default
// job as the worker control's `setDefault(jobId)`. One call moves one click's
// worth of people, so the game's own click-multiplier keys decide how many
// people a call moves and the caller-supplied step sequence paces them. The
// crafting and skilled-servant controls serve every crafted resource from one
// element and take the resource id as the argument. Replace all of it when the
// Vue 3 update exposes job assignment directly.

import type {
  GameDefaultJobRequest,
  GameJobAssignmentRequest,
  GameJobControlsPort,
} from "../../ports/game-job-controls.ts";
import { isRecord, requireFunction } from "../validation.ts";

export interface GameJobControlsDependencies {
  readonly getVueById: (elementId: string) => unknown;

  /**
   * One element per component call the game needs to move `count` people. The
   * sequence holds the game's click-multiplier keys, so it is iterated only
   * once the control is known to be actionable.
   */
  readonly clickSteps: (count: number) => Iterable<unknown>;
}

export function createGameJobControls({
  getVueById,
  clickSteps,
}: GameJobControlsDependencies): GameJobControlsPort {
  function click(
    method: string,
    { elementId, count, craftedResourceId }: GameJobAssignmentRequest,
  ): boolean {
    const view = getVueById(elementId);
    if (!isRecord(view) || typeof view[method] !== "function") {
      return false;
    }
    const call = requireFunction(
      view[method],
      `${elementId} Vue view.${method}`,
    );
    const args = craftedResourceId === undefined ? [] : [craftedResourceId];
    for (const _step of clickSteps(count)) {
      Reflect.apply(call, view, args);
    }
    return true;
  }

  return Object.freeze({
    assign(request: GameJobAssignmentRequest): boolean {
      return click("add", request);
    },

    unassign(request: GameJobAssignmentRequest): boolean {
      return click("sub", request);
    },

    setDefault({ elementId, jobId }: GameDefaultJobRequest): boolean {
      const view = getVueById(elementId);
      if (!isRecord(view) || typeof view["setDefault"] !== "function") {
        return false;
      }
      const setDefault = requireFunction(
        view["setDefault"],
        `${elementId} Vue view.setDefault`,
      );
      Reflect.apply(setDefault, view, [jobId]);
      return true;
    },
  });
}
