// TRANSITIONAL: the Vue 2 revolution modal mounts as `govModal`, and its
// component's `setGov()` method is the only way to commit a government choice.
// The modal exists only while it is open, so the command checks first. Replace
// it when the Vue 3 update exposes government selection directly.

import type { GameGovernmentSelectionPort } from "../../ports/game-government-selection.ts";
import { isRecord, requireFunction } from "../validation.ts";

/** The element id the game gives the open revolution modal. */
const GOVERNMENT_MODAL = "govModal";

export interface GameGovernmentSelectionDependencies {
  readonly getVueById: (elementId: string) => unknown;
}

export function createGameGovernmentSelection({
  getVueById,
}: GameGovernmentSelectionDependencies): GameGovernmentSelectionPort {
  return Object.freeze({
    selectGovernment(government: string): boolean {
      const view = getVueById(GOVERNMENT_MODAL);
      if (!isRecord(view) || typeof view["setGov"] !== "function") {
        return false;
      }
      const setGov = requireFunction(
        view["setGov"],
        `${GOVERNMENT_MODAL} Vue view.setGov`,
      );
      Reflect.apply(setGov, view, [government]);
      return true;
    },
  });
}
