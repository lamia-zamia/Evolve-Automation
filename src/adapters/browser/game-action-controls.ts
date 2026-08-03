// TRANSITIONAL: the Vue 2 page renders every buildable action as its own
// element whose component exposes `action()`, and exposes a powered building's
// on and off switches as `power_on()` and `power_off()`. One call switches one
// click's worth of instances, so the game's own click-multiplier keys decide
// how many a call moves and the caller-supplied step sequence paces them. The
// open tooltip is a single `#popper` element that the game rewrites from
// whichever action is being run, and the star dock's part controls are unmounted
// with their modal, so their components have to be kept. Replace all of it when
// the Vue 3 update exposes running an action and switching power directly.

import type {
  GameActionControlsPort,
  GameActionPowerRequest,
} from "../../ports/game-action-controls.ts";
import { isRecord, requireFunction } from "../validation.ts";

/** The element the page shows an action tooltip in, and the name it is parked under. */
const TOOLTIP_ID = "popper";
const PARKED_TOOLTIP_ID = "TotallyNotAPopper";

/** The subset of a jQuery selection of the tooltip this adapter touches. */
interface TooltipSelection {
  readonly length: number;
  is(selector: string): boolean;
  data(key: string): unknown;
  attr(name: string, value: string): unknown;
}

export interface GameActionControlsDependencies {
  readonly getVueById: (elementId: string) => unknown;

  /** The page's current action tooltip, whether or not one is shown. */
  readonly selectTooltip: () => TooltipSelection;

  /**
   * One element per component call the game needs to switch `count` instances.
   * The sequence holds the game's click-multiplier keys, so it is iterated only
   * once the control is known to be actionable.
   */
  readonly clickSteps: (count: number) => Iterable<unknown>;
}

interface ControlCall {
  readonly view: Record<PropertyKey, unknown>;
  readonly call: (...args: unknown[]) => unknown;
}

export function createGameActionControls({
  getVueById,
  selectTooltip,
  clickSteps,
}: GameActionControlsDependencies): GameActionControlsPort {
  const captured = new Map<string, Record<PropertyKey, unknown>>();

  function controlOf(
    elementId: string,
  ): Record<PropertyKey, unknown> | undefined {
    const held = captured.get(elementId);
    if (held !== undefined) {
      return held;
    }

    const view = getVueById(elementId);
    return isRecord(view) ? view : undefined;
  }

  function methodOf(
    elementId: string,
    method: string,
  ): ControlCall | undefined {
    const view = controlOf(elementId);
    if (view === undefined || typeof view[method] !== "function") {
      return undefined;
    }

    return {
      view,
      call: requireFunction(view[method], `${elementId} Vue view.${method}`),
    };
  }

  function click(
    method: string,
    { elementId, count }: GameActionPowerRequest,
  ): boolean {
    const target = methodOf(elementId, method);
    if (target === undefined) {
      return false;
    }

    for (const _step of clickSteps(count)) {
      Reflect.apply(target.call, target.view, []);
    }
    return true;
  }

  /** A tooltip opened over another control would be rewritten by this action. */
  function isForeignTooltip(
    tooltip: TooltipSelection,
    elementId: string,
  ): boolean {
    if (tooltip.length === 0) {
      return false;
    }

    const owner = tooltip.data("id");
    return typeof owner !== "string" || !owner.includes(elementId);
  }

  return Object.freeze({
    isRendered(elementId: string): boolean {
      return isRecord(getVueById(elementId));
    },

    activate(elementId: string): boolean {
      const target = methodOf(elementId, "action");
      if (target === undefined) {
        return false;
      }

      const tooltip = selectTooltip();
      const parked = isForeignTooltip(tooltip, elementId);
      if (parked) {
        tooltip.attr("id", PARKED_TOOLTIP_ID);
      }

      // A game bug in action() can throw. There is no good way to handle that,
      // but the tooltip has to be named back or it gets stuck on the page.
      try {
        Reflect.apply(target.call, target.view, []);
      } finally {
        if (parked) {
          tooltip.attr("id", TOOLTIP_ID);
        }
      }
      return true;
    },

    isTooltipShown(): boolean {
      const tooltip = selectTooltip();
      return tooltip.length > 0 && tooltip.is(":visible");
    },

    powerOn(request: GameActionPowerRequest): boolean {
      return click("power_on", request);
    },

    powerOff(request: GameActionPowerRequest): boolean {
      return click("power_off", request);
    },

    capture(elementId: string): boolean {
      const view = getVueById(elementId);
      if (!isRecord(view)) {
        return false;
      }

      captured.set(elementId, view);
      return true;
    },

    isCaptured(elementId: string): boolean {
      return captured.has(elementId);
    },
  });
}
