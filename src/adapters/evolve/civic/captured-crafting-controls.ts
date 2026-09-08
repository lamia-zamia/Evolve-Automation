/**
 * Manual crafting through the resource-row controls captured from the upstream page.
 *
 * DeadSpace binds `craft(resourceId, count)` on each `res<Resource>` row. The adapter passes the
 * requested amount through once; the game remains the owner of costs, resource limits, and the
 * resulting quantities.
 */

import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type {
  GameCraftRequest,
  GameCraftingControlsPort,
} from "../../../ports/game-crafting-controls.ts";

export interface CapturedCraftingControlsDependencies {
  readonly controls: GameControlRegistry;
}

export function createCapturedCraftingControls({
  controls,
}: CapturedCraftingControlsDependencies): GameCraftingControlsPort {
  return Object.freeze({
    craft({ elementId, resourceId, count }: GameCraftRequest) {
      if (!Number.isFinite(count)) return false;
      const handle = controls.resolve(elementId);
      if (handle === undefined) return false;
      return controls.invoke(handle, "craft", [resourceId, count]).ok;
    },
  });
}
