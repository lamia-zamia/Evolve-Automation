// TRANSITIONAL: the Vue 2 foreign-affairs panel mounts as `foreign`, and its
// component carries the foreign slice's surface: `vis()` reports whether the
// panel is unlocked, `spy_disabled(govIndex)` reports whether training a spy
// against that government is blocked, and `spy(govIndex)` is the only command
// that trains a spy. `vis()` and `spy_disabled` are pure game-state reads, so
// the Vue 3 update exposes them directly. Replace this adapter when it does.
//
// TRANSITIONAL: the game disables a spy only while a previous spy is still in
// training or the spy cost exceeds the money on hand; child components are not
// initialized before the panel, so `spy_disabled` must report false rather than
// refusing when the panel cannot answer yet.

import type { GameForeignControlsPort } from "../../ports/game-foreign-controls.ts";
import { isRecord, requireFunction } from "../validation.ts";

/** The element id the game gives the foreign-affairs panel. */
const FOREIGN_PANEL = "foreign";

export interface GameForeignControlsDependencies {
  readonly getVueById: (elementId: string) => unknown;
}

export function createGameForeignControls({
  getVueById,
}: GameForeignControlsDependencies): GameForeignControlsPort {
  return Object.freeze({
    isUnlocked(): boolean {
      const view = getVueById(FOREIGN_PANEL);
      if (!isRecord(view) || typeof view.vis !== "function") {
        return false;
      }
      const vis = requireFunction(view.vis, `${FOREIGN_PANEL} Vue view.vis`);
      return Reflect.apply(vis, view, []) === true;
    },

    isSpyDisabled(governmentId: number): boolean {
      const view = getVueById(FOREIGN_PANEL);
      if (!isRecord(view) || typeof view.spy_disabled !== "function") {
        return false;
      }
      const spyDisabled = requireFunction(
        view.spy_disabled,
        `${FOREIGN_PANEL} Vue view.spy_disabled`,
      );
      return Reflect.apply(spyDisabled, view, [governmentId]) === true;
    },

    trainSpy(governmentId: number): boolean {
      const view = getVueById(FOREIGN_PANEL);
      if (!isRecord(view) || typeof view.spy !== "function") {
        return false;
      }
      const spy = requireFunction(view.spy, `${FOREIGN_PANEL} Vue view.spy`);
      Reflect.apply(spy, view, [governmentId]);
      return true;
    },
  });
}
