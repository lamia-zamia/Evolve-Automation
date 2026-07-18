import type {
  PowerCycleInput,
  PowerWarnBuildingInput,
} from "../domain/power.ts";

export interface PowerReader {
  readCycle(): PowerCycleInput;
  readWarnings(domIds: readonly string[]): readonly PowerWarnBuildingInput[];
  readStateOn(binding: string): number;
}

export interface PowerWarningSource {
  readDebugEnabled(): boolean;
  readWarnedBuildingDomIds(): readonly string[];
}
