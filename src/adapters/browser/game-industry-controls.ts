// TRANSITIONAL: the Vue 2 page renders each industry panel's weighting control
// as its own element whose component exposes `add()` and `sub()`. One call moves
// one click's worth of weight, so the game's own click-multiplier keys decide
// how far a call moves the split and the caller-supplied step sequence paces
// them. The panels that weigh several productions from one element take the
// production id as the argument. Replace all of it when the Vue 3 update exposes
// industry weighting directly.

import type {
  GameIndustryControlsPort,
  GameIndustryWeightRequest,
} from "../../ports/game-industry-controls.ts";
import { isRecord, requireFunction } from "../validation.ts";

export interface GameIndustryControlsDependencies {
  readonly getVueById: (elementId: string) => unknown;

  /**
   * One element per component call the game needs to move the split `count`
   * steps. The sequence holds the game's click-multiplier keys, so it is
   * iterated only once the control is known to be actionable.
   */
  readonly clickSteps: (count: number) => Iterable<unknown>;
}

export function createGameIndustryControls({
  getVueById,
  clickSteps,
}: GameIndustryControlsDependencies): GameIndustryControlsPort {
  function click(
    method: string,
    { elementId, count, productionId }: GameIndustryWeightRequest,
  ): boolean {
    const view = getVueById(elementId);
    if (!isRecord(view) || typeof view[method] !== "function") {
      return false;
    }

    const call = requireFunction(
      view[method],
      `${elementId} Vue view.${method}`,
    );
    const args = productionId === undefined ? [] : [productionId];
    for (const _step of clickSteps(count)) {
      Reflect.apply(call, view, args);
    }
    return true;
  }

  return Object.freeze({
    isRendered(elementId: string): boolean {
      return isRecord(getVueById(elementId));
    },

    increase(request: GameIndustryWeightRequest): boolean {
      return click("add", request);
    },

    decrease(request: GameIndustryWeightRequest): boolean {
      return click("sub", request);
    },
  });
}
