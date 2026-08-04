// TRANSITIONAL: the Vue 2 page renders the outer shipyard (`shipPlans`) and the
// piracy armada (`fleet`) as tracked elements. The shipyard's component exposes
// `avail()`/`setVal()`/`powerText()`/`build()` and its ship rows (`shipRegN`)
// expose `setLoc(region, index)` for any ship by index, while the armada
// exposes `add()`/`sub()` and each call moves `keyMultiplier()` ships. Building
// while the yard sorts its list would land the new ship off the expected
// position, so the sort checkbox is toggled around the build. Replace all of it
// when the Vue 3 update exposes fleet controls directly.

import type {
  GameFleetBuildRequest,
  GameFleetControlsPort,
  GameFleetPartRequest,
  GameFleetStepRequest,
} from "../../ports/game-fleet-controls.ts";
import { isRecord, requireFunction } from "../validation.ts";

export interface GameFleetControlsDependencies {
  readonly getVueById: (elementId: string) => unknown;

  /**
   * One element per component call the game needs to move `count` ships. The
   * sequence holds the game's click-multiplier keys, so it is iterated only
   * once the control is known to be actionable.
   */
  readonly clickSteps: (count: number) => Iterable<unknown>;

  /** The live shipyard the ship rows were rendered from. */
  readonly getGame: () => unknown;

  /** jQuery, whose selection the sort checkbox is walked through. */
  readonly getJQuery: () => (selector: string) => {
    eq(index: number): { click(): void };
  };
}

/**
 * The shipyard's sort checkbox sits next to the fleet-details checkbox, so the
 * sort state the build-around toggle depends on lives on the live shipyard.
 */
function readShipyard(
  getGame: () => unknown,
): { sort: boolean; ships: unknown[] } | null {
  const game = getGame();
  const global = isRecord(game) ? game["global"] : undefined;
  const space = isRecord(global) ? global["space"] : undefined;
  const yard = isRecord(space) ? space["shipyard"] : undefined;
  if (!isRecord(yard)) {
    return null;
  }
  const ships = yard["ships"];
  if (!Array.isArray(ships)) {
    return null;
  }
  return { sort: yard["sort"] === true, ships };
}

export function createGameFleetControls({
  getVueById,
  clickSteps,
  getGame,
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

    buildShip(request: GameFleetBuildRequest): boolean {
      const view = getVueById(request.elementId);
      if (!isRecord(view) || typeof view.build !== "function") {
        return false;
      }
      const build = requireFunction(
        view.build,
        `${request.elementId} Vue view.build`,
      );
      const yard = readShipyard(getGame);
      const sort = yard !== null && yard.sort;
      if (sort) {
        toggleSort(request.elementId);
      }
      Reflect.apply(build, view, []);
      if (yard !== null) {
        const shipRow = getVueById("shipReg0");
        if (isRecord(shipRow) && typeof shipRow.setLoc === "function") {
          const setLoc = requireFunction(
            shipRow.setLoc,
            "shipReg0 Vue view.setLoc",
          );
          Reflect.apply(setLoc, shipRow, [request.region, yard.ships.length]);
        }
      }
      if (sort) {
        toggleSort(request.elementId);
      }
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
