// TRANSITIONAL: the Vue 2 storage tab renders one shared `createHead` panel
// whose component builds a unit per `crate()`/`container()` call and states
// each unit's capacity only inside the sentences `buildCrateDesc()` and
// `buildContainerDesc()` return, where the capacity is the second number. Every
// resource then gets a stack row whose element id is `stack-` followed by the
// resource id, and whose component takes the resource id on `addCrate()`,
// `subCrate()`, `addCon()` and `subCon()`. One call moves one click's worth, so
// the game's own click-multiplier keys decide how far a call moves the count
// and the caller-supplied step sequence paces them. Replace all of it when the
// Vue 3 update exposes storage directly.

import type {
  GameStorageControlsPort,
  GameStorageStackRequest,
} from "../../ports/game-storage-controls.ts";
import { isRecord, requireFunction } from "../validation.ts";

/** The element id the game gives the shared construction panel. */
const CONSTRUCTION_PANEL = "createHead";

/**
 * Which number in a capacity sentence is the capacity. The first is how many
 * units the button builds at once.
 */
const CAPACITY_INDEX = 1;

export interface GameStorageControlsDependencies {
  readonly getVueById: (elementId: string) => unknown;

  /**
   * One element per component call the game needs to move the count. The
   * sequence holds the game's click-multiplier keys, so it is iterated only
   * once the panel is known to be actionable.
   */
  readonly clickSteps: (count: number) => Iterable<unknown>;
}

export function createGameStorageControls({
  getVueById,
  clickSteps,
}: GameStorageControlsDependencies): GameStorageControlsPort {
  function method(
    elementId: string,
    name: string,
  ): { view: object; call: (...args: unknown[]) => unknown } | undefined {
    const view = getVueById(elementId);
    if (!isRecord(view) || typeof view[name] !== "function") {
      return undefined;
    }
    return {
      view,
      call: requireFunction(view[name], `${elementId} Vue view.${name}`),
    };
  }

  function capacity(describe: string): number {
    const target = method(CONSTRUCTION_PANEL, describe);
    if (target === undefined) {
      return 0;
    }
    const sentence = Reflect.apply(target.call, target.view, []);
    if (typeof sentence !== "string") {
      return 0;
    }
    const numbers = sentence.match(/\d+/g);
    const stated = numbers?.[CAPACITY_INDEX];
    return stated === undefined ? 0 : Number(stated);
  }

  function build(count: number, name: string): boolean {
    const target = method(CONSTRUCTION_PANEL, name);
    if (target === undefined) {
      return false;
    }
    for (const _step of clickSteps(count)) {
      Reflect.apply(target.call, target.view, []);
    }
    return true;
  }

  function stack(request: GameStorageStackRequest, name: string): boolean {
    const target = method(request.elementId, name);
    if (target === undefined) {
      return false;
    }
    for (const _step of clickSteps(request.count)) {
      Reflect.apply(target.call, target.view, [request.id]);
    }
    return true;
  }

  return Object.freeze({
    isConstructionRendered(): boolean {
      return isRecord(getVueById(CONSTRUCTION_PANEL));
    },

    crateCapacity(): number {
      return capacity("buildCrateDesc");
    },

    containerCapacity(): number {
      return capacity("buildContainerDesc");
    },

    constructCrates(count: number): boolean {
      return build(count, "crate");
    },

    constructContainers(count: number): boolean {
      return build(count, "container");
    },

    isStackRendered(elementId: string): boolean {
      return isRecord(getVueById(elementId));
    },

    assignCrates(request: GameStorageStackRequest): boolean {
      return stack(request, "addCrate");
    },

    unassignCrates(request: GameStorageStackRequest): boolean {
      return stack(request, "subCrate");
    },

    assignContainers(request: GameStorageStackRequest): boolean {
      return stack(request, "addCon");
    },

    unassignContainers(request: GameStorageStackRequest): boolean {
      return stack(request, "subCon");
    },
  });
}
