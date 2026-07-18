import type { GeneticsToggle } from "../../domain/genetics.ts";
import type { GeneticsControls } from "../../ports/genetics.ts";
import {
  requireFunction,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

export interface GeneticsControlsDependencies {
  // TRANSITIONAL: Genetics commands currently call a Vue 2 view directly and
  // use the legacy key-modifier manager for bulk Novo clicks. Replace both in
  // the Vue 3/browser adapter slice.
  readonly getVueById: (id: string) => unknown;
  readonly getKeyManager: () => unknown;
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
      const keyManager = requireRecord(
        dependencies.getKeyManager(),
        "KeyManager",
      );
      const click = requireFunction(keyManager["click"], "KeyManager.click");
      const rawIterable = Reflect.apply(click, keyManager, [count]);
      const iterable = requireRecord(rawIterable, "KeyManager.click() result");
      const iterator = requireFunction(
        iterable[Symbol.iterator],
        "KeyManager.click() result[Symbol.iterator]",
      );
      const iteratorValue = Reflect.apply(iterator, iterable, []);
      const iteratorRecord = requireRecord(
        iteratorValue,
        "KeyManager.click() iterator",
      );
      const next = requireFunction(
        iteratorRecord["next"],
        "KeyManager.click() iterator.next",
      );
      while (true) {
        const result = requireRecord(
          Reflect.apply(next, iteratorRecord, []),
          "KeyManager.click() iterator result",
        );
        if (result["done"]) break;
        Reflect.apply(novo, view, []);
      }
      return true;
    },
  });
}
