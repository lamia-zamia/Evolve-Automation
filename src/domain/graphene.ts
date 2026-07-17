/**
 * Pure equivalent of the legacy `autoGraphenePlant`. It sorts the fuels, then
 * computes each fuel's target count under the consumption balance and returns
 * the ordered fuel adjustments. The composition root calls `decreaseFuel` /
 * `increaseFuel`; this function performs no reads or mutations.
 */

export interface GrapheneFuelView {
  readonly id: string;
  readonly storageRatio: number;
  readonly rateOfChange: number;
  readonly currentQuantity: number;
  readonly isUnlocked: boolean;
  readonly costQuantity: number;
  readonly costMinRateOfChange: number;
  readonly currentFuelCount: number;
}

export interface GrapheneInput {
  readonly initialised: boolean;
  readonly maxOperating: number;
  readonly grapheneUseful: boolean;
  readonly consumptionBalanceMin: number;
  /** Fuels in `Object.values(GrapheneManager.Fuels)` order. */
  readonly fuels: readonly GrapheneFuelView[];
}

export interface GrapheneFuelAdjustment {
  readonly fuelId: string;
  readonly expectedCurrentFuelCount: number;
  /** Positive increases the fuel, negative decreases it. */
  readonly delta: number;
}

export function planGraphene(
  input: Readonly<GrapheneInput>,
): readonly GrapheneFuelAdjustment[] {
  if (!input.initialised) {
    return Object.freeze([]);
  }

  let remainingPlants = input.maxOperating;
  const fuelAdjust: GrapheneFuelAdjustment[] = [];

  const sortedFuel = [...input.fuels].sort((a, b) =>
    b.storageRatio < 0.995 || a.storageRatio < 0.995
      ? b.storageRatio - a.storageRatio
      : b.rateOfChange - a.rateOfChange,
  );

  for (const fuel of sortedFuel) {
    if (remainingPlants === 0) {
      break;
    }
    if (!fuel.isUnlocked) {
      continue;
    }

    const currentFuelCount = fuel.currentFuelCount;
    let maxFueledForConsumption = remainingPlants;
    if (!input.grapheneUseful) {
      maxFueledForConsumption = 0;
    } else if (
      fuel.currentQuantity <
      maxFueledForConsumption *
        fuel.costQuantity *
        input.consumptionBalanceMin +
        fuel.costMinRateOfChange
    ) {
      const rateOfChange =
        fuel.rateOfChange +
        fuel.costQuantity * currentFuelCount -
        fuel.costMinRateOfChange;
      const affordableAmount = Math.floor(rateOfChange / fuel.costQuantity);
      maxFueledForConsumption = Math.max(
        Math.min(maxFueledForConsumption, affordableAmount),
        0,
      );
    }

    const deltaFuel = maxFueledForConsumption - currentFuelCount;
    if (deltaFuel !== 0) {
      fuelAdjust.push(
        Object.freeze({
          fuelId: fuel.id,
          expectedCurrentFuelCount: currentFuelCount,
          delta: deltaFuel,
        }),
      );
    }

    remainingPlants -= currentFuelCount + deltaFuel;
  }

  return Object.freeze(fuelAdjust);
}
