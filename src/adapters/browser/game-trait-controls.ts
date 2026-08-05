// TRANSITIONAL: the Vue 2 genetics tab renders the minor-trait levels and the
// major-trait mutations on one `geneticBreakdown` panel, and its component's
// `gene`, `gain` and `purge` methods are the only way to spend on a trait. The
// panel is absent until the run unlocks it, so every command checks first.
// Replace all three when the Vue 3 update exposes trait purchases directly.

import type { GameTraitControlsPort } from "../../ports/game-trait-controls.ts";
import { isRecord, requireFunction } from "../validation.ts";

/** The element id the game gives the trait panel. */
const TRAIT_PANEL = "geneticBreakdown";

export interface GameTraitControlsDependencies {
  readonly getVueById: (elementId: string) => unknown;
}

export function createGameTraitControls({
  getVueById,
}: GameTraitControlsDependencies): GameTraitControlsPort {
  function spend(methodName: string, traitName: string): boolean {
    const view = getVueById(TRAIT_PANEL);
    if (!isRecord(view) || typeof view[methodName] !== "function") {
      return false;
    }
    const method = requireFunction(
      view[methodName],
      `${TRAIT_PANEL} Vue view.${methodName}`,
    );
    Reflect.apply(method, view, [traitName]);
    return true;
  }

  return Object.freeze({
    buyMinorTrait(traitName: string): boolean {
      return spend("gene", traitName);
    },

    gainTrait(traitName: string): boolean {
      return spend("gain", traitName);
    },

    purgeTrait(traitName: string): boolean {
      return spend("purge", traitName);
    },
  });
}
