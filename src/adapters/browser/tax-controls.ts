import type {
  KeyModifierController,
  TaxControls,
} from "../../ports/tax-controls.ts";
import type { TaxAdjustmentDirection } from "../../domain/commands.ts";
import { requireFunction, requireRecord } from "../validation.ts";

export function createBrowserTaxControls(
  getVueById: (id: string) => unknown,
): TaxControls {
  function getControls() {
    const candidate = getVueById("tax_rates");
    if (candidate === undefined || candidate === null) return undefined;
    const controls = requireRecord(candidate, "tax controls");
    requireFunction(controls["add"], "tax controls.add");
    requireFunction(controls["sub"], "tax controls.sub");
    return controls;
  }

  function isAvailable(): boolean {
    return getControls() !== undefined;
  }

  function adjust(direction: TaxAdjustmentDirection): boolean {
    const controls = getControls();
    if (controls === undefined) return false;
    const methodName = direction === "increase" ? "add" : "sub";
    const method = requireFunction(
      controls[methodName],
      `tax controls.${methodName}`,
    );
    Reflect.apply(method, controls, []);
    return true;
  }

  return Object.freeze({ isAvailable, adjust });
}

export function createKeyModifierController(
  clear: () => void,
): KeyModifierController {
  return Object.freeze({ clear });
}
