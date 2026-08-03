// TRANSITIONAL: the Vue 2 project row exposes its purchase as the element
// component's `build(id, steps)`, and the only lever over the game's expensive
// post-purchase `drawTech()` is the main view's own `tabLoad` preference, which
// this adapter turns off around the call. Replace both when the Vue 3 update
// exposes the project purchase directly.

import type {
  GameProjectBuildRequest,
  GameProjectControlsPort,
} from "../../ports/game-project-controls.ts";
import { isRecord, requireFunction } from "../validation.ts";

export interface GameProjectControlsDependencies {
  readonly getVueById: (elementId: string) => unknown;
  readonly getMainVue: () => unknown;
}

export function createGameProjectControls({
  getVueById,
  getMainVue,
}: GameProjectControlsDependencies): GameProjectControlsPort {
  /**
   * The main view's own preference record, when the page is far enough along to
   * have one. Absent means the redraw cannot be suppressed, not that the
   * purchase should be abandoned.
   */
  function readTabPreferences(): Record<PropertyKey, unknown> | undefined {
    const mainView = getMainVue();
    if (!isRecord(mainView)) {
      return undefined;
    }
    const preferences = mainView["s"];
    return isRecord(preferences) ? preferences : undefined;
  }

  return Object.freeze({
    build({
      elementId,
      projectId,
      steps,
      skipTabRedraw,
    }: GameProjectBuildRequest): boolean {
      const view = getVueById(elementId);
      if (!isRecord(view) || typeof view["build"] !== "function") {
        return false;
      }
      const buildProject = requireFunction(
        view["build"],
        `${elementId} Vue view.build`,
      );
      const purchase = () =>
        Reflect.apply(buildProject, view, [projectId, steps]);

      const preferences = skipTabRedraw ? readTabPreferences() : undefined;
      if (preferences === undefined) {
        purchase();
        return true;
      }

      const restore = preferences["tabLoad"];
      try {
        preferences["tabLoad"] = false;
        purchase();
      } finally {
        preferences["tabLoad"] = restore;
      }
      return true;
    },
  });
}
