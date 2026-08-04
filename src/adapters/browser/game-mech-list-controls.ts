// TRANSITIONAL: the Vue 2 page renders the mech list (`mechList`) as a
// tracked element whose component scraps mechs through its `scrap` method and
// reorders them through the Sortable reorder event the game mounts on the
// list element, with the Firefox-sandbox variant cloning the synthetic event
// into the page. Replace all of it when the Vue 3 update exposes mech list
// controls directly.

import type {
  GameMechDragRequest,
  GameMechListControlsPort,
  GameMechScrapRequest,
} from "../../ports/game-mech-list-controls.ts";
import { isRecord, readProperty } from "../validation.ts";

export interface GameMechListControlsDependencies {
  readonly getVueById: (elementId: string) => unknown;

  /** The Sortable the script's own realm can drive the list with. */
  readonly getSortable: () => unknown;

  /** The page's Sortable, read through the window when the sandbox needs it. */
  readonly getPageSortable: () => unknown;

  /** Whether the Firefox sandbox requires cloning the drag event into the page. */
  readonly isSandboxBypass: () => boolean;

  readonly cloneIntoPage: (
    value: unknown,
    options?: Readonly<Record<string, unknown>>,
  ) => unknown;
}

/** The scrap method the list component carries, present. */
function hasScrapMethod(
  view: unknown,
): view is Record<string, unknown> & { scrap: (id: number) => void } {
  return isRecord(view) && typeof view["scrap"] === "function";
}

export function createGameMechListControls({
  getVueById,
  getSortable,
  getPageSortable,
  isSandboxBypass,
  cloneIntoPage,
}: GameMechListControlsDependencies): GameMechListControlsPort {
  return Object.freeze({
    isRendered(elementId: string): boolean {
      return isRecord(getVueById(elementId));
    },

    scrapMech(request: GameMechScrapRequest): boolean {
      const view = getVueById(request.elementId);
      if (!hasScrapMethod(view)) {
        return false;
      }
      Reflect.apply(view["scrap"], view, [request.mechId]);
      return true;
    },

    dragMech(request: GameMechDragRequest): boolean {
      const view = getVueById(request.elementId);
      if (!isRecord(view)) {
        return false;
      }
      const element = readProperty(view, "$el");
      if (typeof element !== "object" || element === null) {
        return false;
      }
      const sortable = isSandboxBypass() ? getPageSortable() : getSortable();
      if (!isRecord(sortable) || typeof sortable["get"] !== "function") {
        return false;
      }
      const instance = Reflect.apply(sortable["get"], sortable, [element]);
      if (!isRecord(instance)) {
        return false;
      }
      const options = instance["options"];
      if (!isRecord(options) || typeof options["onEnd"] !== "function") {
        return false;
      }
      const event = {
        oldDraggableIndex: request.oldIndex,
        newDraggableIndex: request.newIndex,
        from: { querySelectorAll: () => [], insertBefore: () => false },
      };
      const payload = isSandboxBypass()
        ? cloneIntoPage(event, { cloneFunctions: true })
        : event;
      Reflect.apply(options["onEnd"], options, [payload]);
      return true;
    },
  });
}
