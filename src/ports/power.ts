import type {
  PowerCycleInput,
  PowerWarnBuildingInput,
} from "../domain/economy/production/power.ts";

export interface PowerReader {
  /** `undefined` when captured game mechanics cannot provide an exact full cycle. */
  readCycle(): PowerCycleInput | undefined;
  /** Reason from the most recent unavailable cycle; diagnostic only. */
  readUnavailableReason?(): PowerUnavailableReason;
  readWarnings(domIds: readonly string[]): readonly PowerWarnBuildingInput[];
  readStateOn(binding: string): number;
}

export interface PowerUnavailableReason {
  readonly authority:
    | "root"
    | "settings"
    | "job-counts"
    | "exact-demand"
    | "structures"
    | "production"
    | "native-order"
    | "building-state"
    | "native-support"
    | "fleet"
    | "mech"
    | "localization"
    | "resources"
    | "building-rule";
  readonly message: string;
}

export interface PowerWarningSource {
  readDebugEnabled(): boolean;
  readWarnedBuildingDomIds(): readonly string[];
}
