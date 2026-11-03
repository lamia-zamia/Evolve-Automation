import type { GatherResourcesInput } from "../domain/economy/resources/gather-resources.ts";

export interface GatherMaterialTarget {
  readonly source: "research" | "construction";
  readonly targetId: string;
  readonly resourceId: "Lumber" | "Stone" | "Chrysotile";
  readonly quantity: number;
  readonly generation: number;
  readonly isCurrent: () => boolean;
}

export interface GatherResourcesReader {
  read(): GatherResourcesInput;
}
