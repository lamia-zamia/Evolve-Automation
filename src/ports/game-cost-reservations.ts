/**
 * Resources already spoken for by a commitment the player has made.
 *
 * A reservation is not a decision — it is an observation that something else is saving for these
 * resources, which the pure cost-conflict policy turns into a decision. The source names what is
 * reserving and why, so a skipped build can say so.
 */

import type { ReservedCostTarget } from "../domain/cost-conflicts.ts";
import type { GameActionCostReader } from "./game-action-costs.ts";
import type { OfferedTech } from "./game-tech-catalog.ts";

export interface CostReservationSample {
  readonly targets: readonly Readonly<ReservedCostTarget>[];
  /**
   * True when a commitment exists that could not be priced. The reservation set is then known to
   * be incomplete, and a caller must treat spending as unsafe rather than as unreserved.
   */
  readonly unavailable: boolean;
  /** First unavailable commitment, including its queued action identity when known. */
  readonly unavailableReason?: string;
}

export interface CostReservationReadOptions {
  readonly costs?: GameActionCostReader;
  readonly readOfferedTechs?: () =>
    readonly Readonly<OfferedTech>[] | undefined;
}

export interface CostReservationSource {
  readReservations(options?: CostReservationReadOptions): CostReservationSample;
}
