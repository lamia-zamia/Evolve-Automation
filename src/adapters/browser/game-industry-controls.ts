// TRANSITIONAL: the Vue 2 page renders each industry panel's control as its own
// element whose component exposes one named pair of methods: the weighting
// panels `add()`/`sub()`, the factory-style panels `addItem()`/`subItem()`, the
// smelter `addFuel()`/`subFuel()` and `addMetal()`/`subMetal()`, the galaxy
// trade routes `more()`/`less()`, and the graphene plant one pair per fuel
// (`addWood()`/`subWood()`, ...). One call moves one click's worth, so the
// game's own click-multiplier keys decide how far a call moves the split and
// the caller-supplied step sequence paces them. Replace all of it when the Vue 3
// update exposes industry controls directly.

import type {
  GameIndustryControlsPort,
  GameIndustrySelectionRequest,
  GameIndustryStepRequest,
} from "../../ports/game-industry-controls.ts";
import { isRecord, requireFunction } from "../validation.ts";

export interface GameIndustryControlsDependencies {
  readonly getVueById: (elementId: string) => unknown;

  /**
   * One element per component call the game needs to move the split `count`
   * steps. The sequence holds the game's click-multiplier keys, so it is
   * iterated only once the control is known to be actionable.
   */
  readonly clickSteps: (count: number) => Iterable<unknown>;
}

/** The graphene plant names one method pair per fuel instead of one per panel. */
const GRAPHENE_FUEL_METHODS: Readonly<
  Record<string, Readonly<{ add: string; sub: string }>>
> = {
  Lumber: { add: "addWood", sub: "subWood" },
  Coal: { add: "addCoal", sub: "subCoal" },
  Oil: { add: "addOil", sub: "subOil" },
};

export function createGameIndustryControls({
  getVueById,
  clickSteps,
}: GameIndustryControlsDependencies): GameIndustryControlsPort {
  function step(
    request: GameIndustryStepRequest,
    method: string,
    takesId: boolean,
  ): boolean {
    const view = getVueById(request.elementId);
    if (!isRecord(view) || typeof view[method] !== "function") {
      return false;
    }

    const call = requireFunction(
      view[method],
      `${request.elementId} Vue view.${method}`,
    );
    const arg = takesId ? request.id : undefined;
    const args = arg === undefined ? [] : [arg];
    for (const _step of clickSteps(request.count)) {
      Reflect.apply(call, view, args);
    }
    return true;
  }

  /**
   * The fuel pair a panel answers to: the smelter calls `addFuel()`/`subFuel()`
   * for any fuel id, the graphene plant one pair per fuel and no argument.
   */
  function fuelMethod(
    elementId: string,
    fuelId: string | undefined,
    direction: "add" | "sub",
  ): { method: string; takesId: boolean } | null {
    if (elementId === "iGraphene") {
      const pair =
        fuelId === undefined ? undefined : GRAPHENE_FUEL_METHODS[fuelId];
      return pair === undefined
        ? null
        : { method: pair[direction], takesId: false };
    }
    return {
      method: direction === "add" ? "addFuel" : "subFuel",
      takesId: true,
    };
  }

  function fuelStep(
    request: GameIndustryStepRequest,
    direction: "add" | "sub",
  ): boolean {
    const pair = fuelMethod(request.elementId, request.id, direction);
    return pair === null ? false : step(request, pair.method, pair.takesId);
  }

  function select(request: GameIndustrySelectionRequest): boolean {
    const view = getVueById(request.elementId);
    if (
      !isRecord(view) ||
      typeof view.avail !== "function" ||
      typeof view.setVal !== "function"
    ) {
      return false;
    }

    const avail = requireFunction(
      view.avail,
      `${request.elementId} Vue view.avail`,
    );
    const setVal = requireFunction(
      view.setVal,
      `${request.elementId} Vue view.setVal`,
    );
    if (Reflect.apply(avail, view, [request.id]) !== true) {
      return false;
    }
    Reflect.apply(setVal, view, [request.id]);
    return true;
  }

  return Object.freeze({
    isRendered(elementId: string): boolean {
      return isRecord(getVueById(elementId));
    },

    increase(request: GameIndustryStepRequest): boolean {
      return step(request, "add", request.id !== undefined);
    },

    decrease(request: GameIndustryStepRequest): boolean {
      return step(request, "sub", request.id !== undefined);
    },

    increaseItem(request: GameIndustryStepRequest): boolean {
      return step(request, "addItem", request.id !== undefined);
    },

    decreaseItem(request: GameIndustryStepRequest): boolean {
      return step(request, "subItem", request.id !== undefined);
    },

    increaseMetal(request: GameIndustryStepRequest): boolean {
      return step(request, "addMetal", request.id !== undefined);
    },

    decreaseMetal(request: GameIndustryStepRequest): boolean {
      return step(request, "subMetal", request.id !== undefined);
    },

    increaseTrade(request: GameIndustryStepRequest): boolean {
      return step(request, "more", request.id !== undefined);
    },

    decreaseTrade(request: GameIndustryStepRequest): boolean {
      return step(request, "less", request.id !== undefined);
    },

    increaseFuel(request: GameIndustryStepRequest): boolean {
      return fuelStep(request, "add");
    },

    decreaseFuel(request: GameIndustryStepRequest): boolean {
      return fuelStep(request, "sub");
    },

    select,
  });
}
