import type { GeneticsToggle } from "../../domain/traits/genetics.ts";
import type { GameClickMultipliersPort } from "../../ports/game-click-multipliers.ts";
import type { GeneticsControls } from "../../ports/genetics.ts";
import {
  requireFunction,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

export interface GeneticsControlsDependencies {
  // TRANSITIONAL: Genetics commands currently call a Vue 2 view directly.
  // Replace that in the Vue 3/browser adapter slice.
  readonly getVueById: (id: string) => unknown;

  /** Bulk Novo assembly buys several sequences per component call. */
  readonly clickMultipliers: GameClickMultipliersPort;
}

const METHOD_BY_TOGGLE: Readonly<Record<GeneticsToggle, string>> =
  Object.freeze({
    sequence: "toggle",
    boost: "booster",
    auto: "auto_seq",
  });

export function createGeneticsControls(
  dependencies: GeneticsControlsDependencies,
): GeneticsControls {
  let view: UnknownRecord | null = null;
  return Object.freeze({
    capture(): boolean {
      const value = dependencies.getVueById("arpaSequence");
      if (!value) {
        view = null;
        return false;
      }
      view = requireRecord(value, "arpaSequence Vue view");
      return true;
    },

    toggle(toggle: GeneticsToggle): boolean {
      if (view === null) return false;
      const methodName = METHOD_BY_TOGGLE[toggle];
      if (typeof view[methodName] !== "function") return false;
      const method = requireFunction(
        view[methodName],
        `arpaSequence Vue view.${methodName}`,
      );
      Reflect.apply(method, view, []);
      return true;
    },

    assemble(count: number): boolean {
      if (view === null) return false;
      if (typeof view["novo"] !== "function") return false;
      const novo = requireFunction(view["novo"], "arpaSequence Vue view.novo");
      for (const _step of dependencies.clickMultipliers.steps(count)) {
        Reflect.apply(novo, view, []);
      }
      return true;
    },
  });
}
