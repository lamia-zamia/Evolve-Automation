import type { GatherResourcesInput } from "../domain/economy/resources/gather-resources.ts";

export interface GatherResourcesReader {
  read(): GatherResourcesInput;
}
