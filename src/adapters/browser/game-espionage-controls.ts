// TRANSITIONAL: the Vue 2 espionage modal mounts as `espModal`, and its
// component carries one method per covert operation — `influence`, `sabotage`,
// `incite`, `annex`, `purchase` — which is the only way to run one. The modal
// exists only while it is open, so every command checks first. Replace it when
// the Vue 3 update exposes espionage directly.

import type { GameEspionageControlsPort } from "../../ports/game-espionage-controls.ts";
import { isRecord, requireFunction } from "../validation.ts";

/** The element id the game gives the open espionage modal. */
const ESPIONAGE_MODAL = "espModal";

export interface GameEspionageControlsDependencies {
  readonly getVueById: (elementId: string) => unknown;
}

export function createGameEspionageControls({
  getVueById,
}: GameEspionageControlsDependencies): GameEspionageControlsPort {
  return Object.freeze({
    performEspionage(operation: string, govIndex: number): boolean {
      const view = getVueById(ESPIONAGE_MODAL);
      if (!isRecord(view) || typeof view[operation] !== "function") {
        return false;
      }
      const method = requireFunction(
        view[operation],
        `${ESPIONAGE_MODAL} Vue view.${operation}`,
      );
      Reflect.apply(method, view, [govIndex]);
      return true;
    },
  });
}
