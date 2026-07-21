import type { EjectToggleItem } from "../domain/eject-toggles.ts";

export interface EjectToggleReader {
  readItems(): readonly EjectToggleItem[];
}
