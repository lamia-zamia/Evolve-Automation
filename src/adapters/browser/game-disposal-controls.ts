// TRANSITIONAL: the Vue 2 page renders one disposal panel per resource, whose
// element id is the panel's prefix followed by the resource id (`supplyIron`,
// `ejectIron`), and whose component takes the resource id on a named pair of
// methods: `supplyMore()`/`supplyLess()` for the hell lake transports and
// `ejectMore()`/`ejectLess()` for the mass ejector. One call moves one click's
// worth, so the game's own click-multiplier keys decide how far a call moves
// the amount and the caller-supplied step sequence paces them. Replace all of
// it when the Vue 3 update exposes disposal controls directly.

import type {
  GameDisposalControlsPort,
  GameDisposalStepRequest,
} from "../../ports/game-disposal-controls.ts";
import { isRecord, requireFunction } from "../validation.ts";

export interface GameDisposalControlsDependencies {
  readonly getVueById: (elementId: string) => unknown;

  /**
   * One element per component call the game needs to move the amount `count`
   * steps. The sequence holds the game's click-multiplier keys, so it is
   * iterated only once the panel is known to be actionable.
   */
  readonly clickSteps: (count: number) => Iterable<unknown>;
}

export function createGameDisposalControls({
  getVueById,
  clickSteps,
}: GameDisposalControlsDependencies): GameDisposalControlsPort {
  function step(request: GameDisposalStepRequest, method: string): boolean {
    const view = getVueById(request.elementId);
    if (!isRecord(view) || typeof view[method] !== "function") {
      return false;
    }

    const call = requireFunction(
      view[method],
      `${request.elementId} Vue view.${method}`,
    );
    for (const _step of clickSteps(request.count)) {
      Reflect.apply(call, view, [request.id]);
    }
    return true;
  }

  return Object.freeze({
    isRendered(elementId: string): boolean {
      return isRecord(getVueById(elementId));
    },

    increaseSupply(request: GameDisposalStepRequest): boolean {
      return step(request, "supplyMore");
    },

    decreaseSupply(request: GameDisposalStepRequest): boolean {
      return step(request, "supplyLess");
    },

    increaseEject(request: GameDisposalStepRequest): boolean {
      return step(request, "ejectMore");
    },

    decreaseEject(request: GameDisposalStepRequest): boolean {
      return step(request, "ejectLess");
    },
  });
}
