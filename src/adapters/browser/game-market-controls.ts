// TRANSITIONAL: the Vue 2 market tab renders one row per tradable resource,
// whose element id is `market-` followed by the resource id, and whose
// component takes the resource id on `purchase()`, `sell()`, `autoBuy()`,
// `autoSell()` and `zero()`. How much one buy or sell moves lives on a
// separate `market-qty` component, as a writable `qty` and a `limit()` ceiling.
// One route call moves one click's worth, so the game's own click-multiplier
// keys decide how far a call moves the count and the caller-supplied step
// sequence paces them. Replace all of it when the Vue 3 update exposes the
// market directly.

import type {
  GameMarketControlsPort,
  GameMarketRouteRequest,
  GameMarketRow,
} from "../../ports/game-market-controls.ts";
import { isRecord, requireFunction } from "../validation.ts";

/** The element id the game gives the shared trade-quantity control. */
const QUANTITY_PANEL = "market-qty";

/** The quantity the game trades when it is not offering the control. */
const MINIMUM_MULTIPLIER = 1;

export interface GameMarketControlsDependencies {
  readonly getVueById: (elementId: string) => unknown;

  /**
   * One element per component call the game needs to move a route count. The
   * sequence holds the game's click-multiplier keys, so it is iterated only
   * once the row is known to be actionable.
   */
  readonly clickSteps: (count: number) => Iterable<unknown>;
}

export function createGameMarketControls({
  getVueById,
  clickSteps,
}: GameMarketControlsDependencies): GameMarketControlsPort {
  function rowMethod(
    row: GameMarketRow,
    method: string,
  ): { view: object; call: (...args: unknown[]) => unknown } | undefined {
    const view = getVueById(row.elementId);
    if (!isRecord(view) || typeof view[method] !== "function") {
      return undefined;
    }
    return {
      view,
      call: requireFunction(
        view[method],
        `${row.elementId} Vue view.${method}`,
      ),
    };
  }

  function trade(row: GameMarketRow, method: string): boolean {
    const target = rowMethod(row, method);
    if (target === undefined) {
      return false;
    }
    Reflect.apply(target.call, target.view, [row.id]);
    return true;
  }

  function moveRoutes(
    request: GameMarketRouteRequest,
    method: string,
  ): boolean {
    const target = rowMethod(request, method);
    if (target === undefined) {
      return false;
    }
    for (const _step of clickSteps(request.count)) {
      Reflect.apply(target.call, target.view, [request.id]);
    }
    return true;
  }

  return Object.freeze({
    isRowRendered(elementId: string): boolean {
      return isRecord(getVueById(elementId));
    },

    maxMultiplier(): number {
      const view = getVueById(QUANTITY_PANEL);
      if (!isRecord(view) || typeof view["limit"] !== "function") {
        return MINIMUM_MULTIPLIER;
      }
      const limit = requireFunction(
        view["limit"],
        `${QUANTITY_PANEL} Vue view.limit`,
      );
      const value = Reflect.apply(limit, view, []);
      return typeof value === "number" && Number.isFinite(value)
        ? value
        : MINIMUM_MULTIPLIER;
    },

    setMultiplier(multiplier: number): boolean {
      const view = getVueById(QUANTITY_PANEL);
      if (!isRecord(view)) {
        return false;
      }
      view["qty"] = multiplier;
      return true;
    },

    buy(row: GameMarketRow): boolean {
      return trade(row, "purchase");
    },

    sell(row: GameMarketRow): boolean {
      return trade(row, "sell");
    },

    clearTradeRoutes(row: GameMarketRow): boolean {
      return trade(row, "zero");
    },

    addTradeRoutes(request: GameMarketRouteRequest): boolean {
      return moveRoutes(request, "autoBuy");
    },

    removeTradeRoutes(request: GameMarketRouteRequest): boolean {
      return moveRoutes(request, "autoSell");
    },
  });
}
