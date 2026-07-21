import type { ArpaToggleItem } from "../domain/arpa-toggles.ts";

export interface ArpaToggleReader {
  readItems(): readonly ArpaToggleItem[];
}
