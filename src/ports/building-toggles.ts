import type { BuildingToggleItem } from "../domain/building-toggles.ts";

export interface BuildingToggleReader {
  readVisible(): boolean;
  readItems(): readonly BuildingToggleItem[];
}

export interface BuildingToggleCountWriter {
  setCount(count: number): void;
}
