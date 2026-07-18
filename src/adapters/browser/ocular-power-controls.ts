import type { OcularPowerControls } from "../../ports/ocular-power.ts";
import {
  requireBoolean,
  requireFunction,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

export interface OcularPowerControlsDependencies {
  // TRANSITIONAL: Ocular state is currently read from a captured Vue 2 view,
  // while mutations click Buefy checkbox inputs. Replace this contract with
  // the upstream Vue 3 browser adapter when that UI is available.
  readonly getVueById: (id: string) => unknown;
  readonly getDocument: () => unknown;
}

export function createOcularPowerControls(
  dependencies: OcularPowerControlsDependencies,
): OcularPowerControls {
  let view: UnknownRecord | null = null;
  return Object.freeze({
    capture(): boolean {
      const value = dependencies.getVueById("ocularPower");
      if (!value) {
        view = null;
        return false;
      }
      view = requireRecord(value, "ocularPower Vue view");
      return true;
    },

    current(key: string): boolean | null {
      if (view === null) return null;
      return requireBoolean(view[key], `ocularPower Vue view.${key}`);
    },

    toggle(powerId: string): boolean {
      const document = requireRecord(dependencies.getDocument(), "document");
      const getElementById = requireFunction(
        document["getElementById"],
        "document.getElementById",
      );
      const rawElement = Reflect.apply(getElementById, document, [
        `ocular${powerId}`,
      ]);
      if (typeof rawElement !== "object" || rawElement === null) return false;
      const element = requireRecord(rawElement, `document#ocular${powerId}`);
      if (typeof element["querySelector"] !== "function") return false;
      const querySelector = requireFunction(
        element["querySelector"],
        `document#ocular${powerId}.querySelector`,
      );
      const rawInput = Reflect.apply(querySelector, element, ["input"]);
      if (typeof rawInput !== "object" || rawInput === null) return false;
      const input = requireRecord(rawInput, `document#ocular${powerId} input`);
      if (typeof input["click"] !== "function") return false;
      const click = requireFunction(
        input["click"],
        `document#ocular${powerId} input.click`,
      );
      Reflect.apply(click, input, []);
      return true;
    },
  });
}
