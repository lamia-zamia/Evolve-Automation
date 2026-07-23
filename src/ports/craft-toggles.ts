import type { CraftToggleItem } from "../domain/economy/production/craft-toggles.ts";

export interface CraftToggleReader {
  readItems(): readonly CraftToggleItem[];
}
