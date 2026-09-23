import type { CapturedMechDemandSource } from "../../../ports/captured-mech.ts";
import type { CapturedMechReservedResources } from "../../../domain/combat/mech-state.ts";
import type { CostReservationSource } from "../../../ports/game-cost-reservations.ts";

export interface CapturedMechReservationDependencies {
  readonly demand: CapturedMechDemandSource;
  /** Commitments that outrank Mech-first construction, excluding its previous saving target. */
  readonly readReservedQuantityForMechPriority?: (resourceId: string) => number;
}

function readCapturedMechReservationBudget(
  readReservedQuantityForMechPriority:
    ((resourceId: string) => number) | undefined,
): CapturedMechReservedResources {
  const readQuantity = (resourceId: string): number => {
    const quantity = readReservedQuantityForMechPriority?.(resourceId);
    return quantity === undefined
      ? 0
      : typeof quantity === "number" &&
          Number.isFinite(quantity) &&
          quantity >= 0
        ? quantity
        : Number.MAX_SAFE_INTEGER;
  };
  return Object.freeze({
    supply: readQuantity("Supply"),
    soulGems: readQuantity("Soul_Gem"),
  });
}

/** Construction reservation over the shared Mech demand plan. */
export function createCapturedMechReservationSource(
  dependencies: CapturedMechReservationDependencies,
): CostReservationSource {
  return Object.freeze({
    readReservations() {
      const sample = dependencies.demand.read(
        readCapturedMechReservationBudget(
          dependencies.readReservedQuantityForMechPriority,
        ),
      );
      if (!sample.buildingMechsFirst) {
        return Object.freeze({
          unavailable: false,
          targets: Object.freeze([]),
        });
      }
      if (sample.immediatePlan.status === "unavailable") {
        return Object.freeze({
          unavailable: true,
          targets: Object.freeze([]),
        });
      }
      if (sample.immediatePlan.status !== "ready") {
        return Object.freeze({
          unavailable: false,
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
              Supply: sample.immediatePlan.cost.supply,
              Soul_Gem: sample.immediatePlan.cost.gems,
            }),
          }),
        ]),
      });
    },
  });
}
