// TRANSITIONAL: the page renders the outer shipyard (`shipPlans`) and the piracy
// armada (`fleet`) as tracked elements. The shipyard's component exposes
// `avail()`/`setVal()`/`powerText()`/`build()`, while the armada exposes
// `add()`/`sub()` and each call moves `keyMultiplier()` ships. Building while
// the yard sorts its list would land the new ship off the expected position, so
// the sort checkbox is toggled around the build. The shipyard component's `s` is
// the game's own shipyard object, which is the only way to see what a build
// actually did. Replace all of it when the game exposes fleet controls directly.
//
// A built ship is sent onward through the game's dispatch window: the ship row's
// own control opens it, and it renders one button per reachable region carrying
// that region's name as a class. The direct `setLoc(region, index)` call the
// 1.4.x rows carried no longer exists.

import type {
  GameFleetBuildRequest,
  GameFleetBuildResult,
  GameFleetControlsPort,
  GameFleetDispatchRequest,
  GameFleetPartRequest,
  GameFleetStepRequest,
} from "../../ports/game-fleet-controls.ts";
import { isRecord, requireFunction } from "../validation.ts";

const NOT_ACTIONABLE: GameFleetBuildResult = Object.freeze({
  actionable: false,
  builtIndex: null,
});

/** The subset of the page the dispatch window is driven through. */
interface FleetDocument {
  querySelector(selector: string): { click?: () => void } | null;
}

export interface GameFleetControlsDependencies {
  readonly getVueById: (elementId: string) => unknown;

  readonly getDocument: () => FleetDocument;

  /**
   * One element per component call the game needs to move `count` ships. The
   * sequence holds the game's click-multiplier keys, so it is iterated only
   * once the control is known to be actionable.
   */
  readonly clickSteps: (count: number) => Iterable<unknown>;

  /** jQuery, whose selection the sort checkbox is walked through. */
  readonly getJQuery: () => (selector: string) => {
    eq(index: number): { click(): void };
  };
}

/**
 * The shipyard the component was rendered from, which is the game's own object
 * rather than a copy of it. `game.global` is a whole-state deep clone the game
 * rebuilds once a period, so its ship list neither grows when a build appends a
 * ship nor shrinks when one is lost; only this object answers either question
 * during a cycle. The sort flag the build-around toggle depends on lives on it
 * too.
 */
function readShipyard(
  view: Record<string, unknown>,
): Record<string, unknown> | null {
  const yard = view["s"];
  return isRecord(yard) ? yard : null;
}

/** The shipyard's ship count, or null while the list has not been built yet. */
function readShipCount(yard: Record<string, unknown> | null): number | null {
  const ships = yard === null ? undefined : yard["ships"];
  return Array.isArray(ships) ? ships.length : null;
}

export function createGameFleetControls({
  getVueById,
  getDocument,
  clickSteps,
  getJQuery,
}: GameFleetControlsDependencies): GameFleetControlsPort {
  function step(
    elementId: string,
    method: string,
    args: readonly unknown[],
    count: number,
  ): boolean {
    const view = getVueById(elementId);
    if (!isRecord(view) || typeof view[method] !== "function") {
      return false;
    }
    const call = requireFunction(
      view[method],
      `${elementId} Vue view.${method}`,
    );
    for (const _step of clickSteps(count)) {
      Reflect.apply(call, view, args);
    }
    return true;
  }

  function stepShip(request: GameFleetStepRequest, method: string): boolean {
    return step(
      request.elementId,
      method,
      [request.region, request.ship],
      request.count,
    );
  }

  function toggleSort(elementId: string): void {
    getJQuery()(`#${elementId} .b-checkbox`).eq(1).click();
  }

  return Object.freeze({
    isRendered(elementId: string): boolean {
      return isRecord(getVueById(elementId));
    },

    isPartAvailable(request: GameFleetPartRequest): boolean {
      if (request.index === undefined) {
        return false;
      }
      const view = getVueById(request.elementId);
      if (!isRecord(view) || typeof view.avail !== "function") {
        return false;
      }
      const avail = requireFunction(
        view.avail,
        `${request.elementId} Vue view.avail`,
      );
      return Boolean(
        Reflect.apply(avail, view, [request.type, request.index, request.part]),
      );
    },

    setPart(request: GameFleetPartRequest): boolean {
      return step(request.elementId, "setVal", [request.type, request.part], 1);
    },

    hasShipPower(elementId: string): boolean {
      const view = getVueById(elementId);
      if (!isRecord(view) || typeof view.powerText !== "function") {
        return false;
      }
      const powerText = requireFunction(
        view.powerText,
        `${elementId} Vue view.powerText`,
      );
      const text = Reflect.apply(powerText, view, []);
      return typeof text === "string" && !text.includes("danger");
    },

    buildShip(request: GameFleetBuildRequest): GameFleetBuildResult {
      const view = getVueById(request.elementId);
      if (!isRecord(view) || typeof view.build !== "function") {
        return NOT_ACTIONABLE;
      }
      const build = requireFunction(
        view.build,
        `${request.elementId} Vue view.build`,
      );
      const yard = readShipyard(view);
      const sort = yard !== null && yard["sort"] === true;
      if (sort) {
        toggleSort(request.elementId);
      }
      const countBefore = readShipCount(yard);
      Reflect.apply(build, view, []);
      const countAfter = readShipCount(yard);
      if (sort) {
        toggleSort(request.elementId);
      }
      // A cost the yard cannot pay at the click queues the order instead of
      // appending a ship, so the count is what says a build happened. Reading
      // past the end of the list would dispatch a ship that does not exist.
      const built =
        countBefore !== null && countAfter !== null && countAfter > countBefore;
      return { actionable: true, builtIndex: built ? countAfter! - 1 : null };
    },

    dispatchTrigger(index: number): string {
      return `#ship${index}loc`;
    },

    dispatchShip(request: GameFleetDispatchRequest): boolean {
      // Each destination button carries its region as a class, so the region
      // names the control without depending on the order the window lists them.
      const destination = getDocument().querySelector(
        `#modalBox .shipDispatch button.${request.region}`,
      );
      if (typeof destination?.click !== "function") {
        return false;
      }
      destination.click();
      return true;
    },

    addShips(request: GameFleetStepRequest): boolean {
      return stepShip(request, "add");
    },

    subShips(request: GameFleetStepRequest): boolean {
      return stepShip(request, "sub");
    },
  });
}
