import type { ArpaToggleItem } from "../domain/progression/research/arpa-toggles.ts";

export interface ArpaToggleReader {
  readItems(): readonly ArpaToggleItem[];
}
