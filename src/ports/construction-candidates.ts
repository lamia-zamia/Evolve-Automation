/**
 * One ordered construction cycle shared by every family that spends on buildings.
 *
 * City buildings and A.R.P.A. projects compete for the same resources, so they cannot each run
 * their own cycle: whichever went first would spend without seeing the other's total order. A
 * family therefore contributes candidates and owns its own purchase, while affordability, cost
 * conflicts and resource competition are asked once for the merged list.
 */

import type {
  BuildCandidateView,
  BuildConsumptionMode,
} from "../domain/progression/build/build.ts";
import type { BuildClickResult } from "./build.ts";

/** One purchasable target a family offers this cycle. */
export interface ConstructionCandidate extends BuildCandidateView {
  /** The caller's "build this regardless" setting; it bypasses the cost-conflict gate. */
  readonly important: boolean;
}

/** Settings that govern the whole cycle rather than any one family. */
export interface ConstructionCycleOptions {
  readonly consumptionMode: BuildConsumptionMode;
  readonly buildIfStorageFull: boolean;
  readonly ignoreZeroRate: boolean;
  /** Whether an existing commitment holds its resources back from these purchases. */
  readonly respectReservations: boolean;
}

export interface ConstructionCandidateSource {
  /** Names the family in diagnostics; two sources may not offer the same candidate key. */
  readonly family: string;
  /** Samples this family's candidates for one cycle, in its own preferred order. */
  beginCycle(): readonly Readonly<ConstructionCandidate>[];
  /** Buys the candidate this source offered under `key` during the current cycle. */
  execute(key: string): BuildClickResult;
}
