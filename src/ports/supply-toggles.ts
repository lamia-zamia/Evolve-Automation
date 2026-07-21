import type { SupplyToggleItem } from "../domain/supply-toggles.ts";

export interface SupplyToggleReader {
  readItems(): readonly SupplyToggleItem[];
}
