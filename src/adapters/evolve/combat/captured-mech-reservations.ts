import { planMechDemandCosts } from "../../../domain/combat/mech-auto-choice.ts";
import type { CostReservationSource } from "../../../ports/game-cost-reservations.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";

export interface CapturedMechReservationDependencies {
  readonly rootState: GameRootStateSource;
  readonly readSettings: () => unknown;
}

/**
 * The pursued automatic Mech build as a cost reservation, so the build loop
 * does not spend its Supply or Soul Gems on something cheaper that arrives
 * first. Derived from the same pure choice as the demand requests, keeping
 * one target behind both channels.
 */
export function createCapturedMechReservationSource(
  dependencies: CapturedMechReservationDependencies,
): CostReservationSource {
  return Object.freeze({
    readReservations() {
      const demand = planMechDemandCosts({
        root: dependencies.rootState.readRoot(),
        settings: dependencies.readSettings(),
      });
      if (demand === null) {
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
              Supply: demand.supply,
              Soul_Gem: demand.gems,
            }),
          }),
        ]),
      });
    },
  });
}
