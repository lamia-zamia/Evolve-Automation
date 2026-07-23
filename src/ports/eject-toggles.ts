import type { EjectToggleItem } from "../domain/economy/resources/eject-toggles.ts";

export interface EjectToggleReader {
  readItems(): readonly EjectToggleItem[];
}
