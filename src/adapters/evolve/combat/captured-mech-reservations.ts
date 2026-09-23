import type { CapturedMechDemandSource } from "../../../ports/captured-mech.ts";
import type { CostReservationSource } from "../../../ports/game-cost-reservations.ts";

export interface CapturedMechReservationDependencies {
  readonly demand: CapturedMechDemandSource;
}

/** Construction reservation over the shared Mech demand plan. */
export function createCapturedMechReservationSource(
  dependencies: CapturedMechReservationDependencies,
): CostReservationSource {
  return Object.freeze({
    readReservations() {
      const sample = dependencies.demand.read();
      if (!sample.buildingMechsFirst || sample.plan.status === "none") {
        return Object.freeze({
          unavailable: false,
          targets: Object.freeze([]),
        });
      }
      if (sample.plan.status === "unavailable") {
        return Object.freeze({
          unavailable: true,
          targets: Object.freeze([]),
        });
      }
      return Object.freeze({
        unavailable: false,
        targets: Object.freeze([
          Object.freeze({
            name: "mech",
            cause: "autoMech",
            cost: Object.freeze({
              Supply: sample.plan.cost.supply,
              Soul_Gem: sample.plan.cost.gems,
            }),
          }),
        ]),
      });
    },
  });
}
