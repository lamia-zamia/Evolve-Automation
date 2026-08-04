// TRANSITIONAL: the Vue 2 page renders the mech assembly (`mechAssembly`) as a
// tracked element whose component configures and builds a mech through the
// `setSize`/`setType`/`setWep`/`setEquip` methods and the `build()` finish,
// with the infernal-material flag stored on the component's `b` data. Replace
// all of it when the Vue 3 update exposes mech assembly controls directly.

import type {
  GameMechAssemblyRequest,
  GameMechControlsPort,
} from "../../ports/game-mech-controls.ts";
import { isRecord, requireFunction } from "../validation.ts";

export interface GameMechControlsDependencies {
  readonly getVueById: (elementId: string) => unknown;
}

/** The assembly component methods a build needs, all present. */
function hasAssemblyMethods(view: unknown): view is Record<string, unknown> & {
  setSize: (size: string) => void;
  setType: (chassis: string) => void;
  setWep: (weapon: string, slot: number) => void;
  setEquip: (equip: string, slot: number) => void;
  build: () => void;
} {
  if (!isRecord(view)) {
    return false;
  }
  return (
    typeof view["setSize"] === "function" &&
    typeof view["setType"] === "function" &&
    typeof view["setWep"] === "function" &&
    typeof view["setEquip"] === "function" &&
    typeof view["build"] === "function"
  );
}

export function createGameMechControls({
  getVueById,
}: GameMechControlsDependencies): GameMechControlsPort {
  return Object.freeze({
    isRendered(elementId: string): boolean {
      return isRecord(getVueById(elementId));
    },

    assembleMech(request: GameMechAssemblyRequest): boolean {
      const view = getVueById(request.elementId);
      if (!hasAssemblyMethods(view)) {
        return false;
      }
      const b = view["b"];
      if (isRecord(b)) {
        b["infernal"] = request.infernal;
      }
      const method = (name: string) =>
        requireFunction(view[name], `${request.elementId} Vue view.${name}`);
      const setSize = method("setSize");
      const setType = method("setType");
      const setWep = method("setWep");
      const setEquip = method("setEquip");
      const build = method("build");
      Reflect.apply(setSize, view, [request.size]);
      Reflect.apply(setType, view, [request.chassis]);
      for (let slot = 0; slot < request.hardpoints.length; slot++) {
        Reflect.apply(setWep, view, [request.hardpoints[slot], slot]);
      }
      for (let slot = 0; slot < request.equips.length; slot++) {
        Reflect.apply(setEquip, view, [request.equips[slot], slot]);
      }
      Reflect.apply(build, view, []);
      return true;
    },
  });
}
