// TRANSITIONAL: the Vue 2 resources tab renders every resource as its own row
// element whose component exposes `craft(resourceId, count)`. That call scales
// the count by whichever of the game's click-multiplier keys it believes are
// held, so the keys are cleared first and the requested amount is the amount
// crafted. Replace it when the Vue 3 update exposes manual crafting directly.

import type {
  GameCraftRequest,
  GameCraftingControlsPort,
} from "../../ports/game-crafting-controls.ts";
import { isRecord, requireFunction } from "../validation.ts";

export interface GameCraftingControlsDependencies {
  readonly getVueById: (elementId: string) => unknown;

  /**
   * Releases the game's click-multiplier keys, so the component takes the
   * requested count literally. It is called only once the control is known to
   * be actionable.
   */
  readonly clearClickMultipliers: () => void;
}

export function createGameCraftingControls({
  getVueById,
  clearClickMultipliers,
}: GameCraftingControlsDependencies): GameCraftingControlsPort {
  return Object.freeze({
    craft({ elementId, resourceId, count }: GameCraftRequest): boolean {
      const view = getVueById(elementId);
      if (!isRecord(view) || typeof view["craft"] !== "function") {
        return false;
      }

      const call = requireFunction(
        view["craft"],
        `${elementId} Vue view.craft`,
      );
      clearClickMultipliers();
      Reflect.apply(call, view, [resourceId, count]);
      return true;
    },
  });
}
