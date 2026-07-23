import type { SupplyToggleItem } from "../domain/economy/resources/supply-toggles.ts";

export interface SupplyToggleReader {
  readItems(): readonly SupplyToggleItem[];
}
