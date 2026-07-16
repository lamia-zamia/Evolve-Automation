import type { TaxAdjustmentDirection } from "../domain/commands.ts";

export interface TaxControls {
  isAvailable(): boolean;
  adjust(direction: TaxAdjustmentDirection): boolean;
}

export interface KeyModifierController {
  clear(): void;
}
