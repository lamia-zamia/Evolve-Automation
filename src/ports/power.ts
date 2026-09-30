import type {
  PowerCycleInput,
  PowerWarnBuildingInput,
} from "../domain/economy/production/power.ts";

export interface PowerReader {
  /** `undefined` when captured game mechanics cannot provide an exact full cycle. */
  readCycle(): PowerCycleInput | undefined;
  readWarnings(domIds: readonly string[]): readonly PowerWarnBuildingInput[];
  readStateOn(binding: string): number;
}

export interface PowerWarningSource {
  readDebugEnabled(): boolean;
  readWarnedBuildingDomIds(): readonly string[];
}
