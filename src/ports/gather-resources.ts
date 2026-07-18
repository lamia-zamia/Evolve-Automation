import type { GatherResourcesInput } from "../domain/gather-resources.ts";

export interface GatherResourcesReader {
  read(): GatherResourcesInput;
}
