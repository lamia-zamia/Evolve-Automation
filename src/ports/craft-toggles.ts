import type { CraftToggleItem } from "../domain/craft-toggles.ts";

export interface CraftToggleReader {
  readItems(): readonly CraftToggleItem[];
}
