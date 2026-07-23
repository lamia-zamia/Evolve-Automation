import type { WishTier } from "../../domain/traits/wish.ts";
import type { WishControls } from "../../ports/wish.ts";

export interface WishControlsDependencies {
  // TRANSITIONAL: Current wish availability is exposed by Vue 2 mount points
  // and selection is dispatched through jQuery. Replace both with the Vue 3
  // browser adapter when upstream's new UI contract is available.
  readonly getVueById: (id: string) => unknown;
  readonly clickSelector: (selector: string) => unknown;
}

export function createWishControls(
  dependencies: WishControlsDependencies,
): WishControls {
  return Object.freeze({
    select(tier: WishTier, wishId: string) {
      const panelId = tier === "minor" ? "minorWish" : "majorWish";
      if (!dependencies.getVueById(panelId)) return false;
      dependencies.clickSelector(`#wish${wishId}`);
      return true;
    },
  });
}
