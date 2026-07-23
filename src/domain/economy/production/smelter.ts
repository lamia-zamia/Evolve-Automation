/**
 * Pure equivalent of the legacy `autoSmelter`. It replays the fuel-allocation
 * pass (only for non-forge races) and the iron/steel/iridium smelting decision,
 * returning the ordered fuel and smelting adjustments plus the income-warning
 * tooltips to publish. The composition root writes the tooltips into the script
 * `state` model and applies the adjustments through a command executor; this
 * function performs no reads or mutations.
 */

export interface SmelterCostView {
  readonly resourceName: string;
  readonly currentQuantity: number;
  readonly rateOfChange: number;
  readonly minRateOfChange: number;
  readonly quantity: number;
  readonly isDemanded: boolean;
}

export interface SmelterFuelView {
  readonly id: string;
  readonly unlocked: boolean;
  /** `fuel === Fuels.Inferno && nextFuel === Fuels.Oil` (the efficiency case). */
  readonly isInfernoBeforeOil: boolean;
  readonly currentFuelCount: number;
  readonly cost: readonly SmelterCostView[];
}

export interface SmelterInput {
  readonly initialised: boolean;
  readonly hasForge: boolean;
  readonly totalSmelters: number;
  readonly extraOperating: number;
  readonly consumptionBalanceMin: number;
  /** Fuels in `managedFuelPriorityList()` order; empty for a forge race. */
  readonly fuels: readonly SmelterFuelView[];
  readonly ironCount: number;
  readonly steelCount: number;
  readonly iridiumCount: number;
  readonly iridiumUnlocked: boolean;
  readonly iridiumCapped: boolean;
  readonly productionSmeltingIridium: number;
  readonly productionSmelting: string;
  readonly steelCost: readonly SmelterCostView[];
  readonly ironTimeToFull: number;
  readonly ironTimeToRequired: number;
  readonly ironDemanded: boolean;
  readonly steelTimeToFull: number;
  readonly steelTimeToRequired: number;
  readonly steelDemanded: boolean;
  readonly minerCount: number;
  readonly beltIronShipStateOnCount: number;
  readonly titaniumStorageRatio: number;
  readonly haveTitaniumTech: boolean;
}

export interface SmelterFuelAdjustment {
  readonly fuelId: string;
  readonly expectedCurrentFuelCount: number;
  /** Positive increases the fuel, negative decreases it. */
  readonly delta: number;
}

export type SmelterProductionId = "Iron" | "Steel" | "Iridium";

export interface SmelterSmeltAdjustment {
  readonly productionId: SmelterProductionId;
  readonly expectedCurrentCount: number;
  /** Positive increases smelting, negative decreases it. */
  readonly delta: number;
}

export interface SmelterTooltip {
  readonly key: string;
  readonly value: string;
}

export interface SmelterDecision {
  readonly fuelAdjustments: readonly SmelterFuelAdjustment[];
  readonly smeltAdjustments: readonly SmelterSmeltAdjustment[];
  readonly tooltips: readonly SmelterTooltip[];
}

const EMPTY_DECISION: SmelterDecision = Object.freeze({
  fuelAdjustments: Object.freeze([]),
  smeltAdjustments: Object.freeze([]),
  tooltips: Object.freeze([]),
});

/** Legacy "allow using all resources for fuel until 60s of consumption left". */
function costLimitsUnits(
  cost: SmelterCostView,
  units: number,
  consumptionBalanceMin: number,
): boolean {
  return (
    cost.currentQuantity <
      units * cost.quantity * consumptionBalanceMin + cost.minRateOfChange ||
    cost.isDemanded
  );
}

function affordableUnits(
  cost: SmelterCostView,
  currentFuelCount: number,
): number {
  const remainingRateOfChange =
    cost.rateOfChange + currentFuelCount * cost.quantity - cost.minRateOfChange;
  return Math.max(0, Math.floor(remainingRateOfChange / cost.quantity));
}

export function planSmelter(input: Readonly<SmelterInput>): SmelterDecision {
  if (!input.initialised) {
    return EMPTY_DECISION;
  }

  const tooltips: SmelterTooltip[] = [];
  const fuelAdjustments: SmelterFuelAdjustment[] = [];
  let totalSmelters = input.totalSmelters;
  let fuelRemoved = 0;

  if (!input.hasForge) {
    let remainingSmelters = totalSmelters;
    for (const fuel of input.fuels) {
      if (!fuel.unlocked) {
        continue;
      }

      let maxAllowedUnits = remainingSmelters;
      // Adjust Inferno to Oil ratio for better efficiency and cost.
      if (fuel.isInfernoBeforeOil && remainingSmelters > 75) {
        maxAllowedUnits = Math.floor(0.5 * remainingSmelters + 37.5);
      }

      for (const cost of fuel.cost) {
        if (
          costLimitsUnits(cost, maxAllowedUnits, input.consumptionBalanceMin)
        ) {
          const affordable = affordableUnits(cost, fuel.currentFuelCount);
          if (affordable < maxAllowedUnits) {
            tooltips.push({
              key: "smelterFuels" + fuel.id.toLowerCase(),
              value: `Too low ${cost.resourceName} income<br>`,
            });
          }
          maxAllowedUnits = Math.min(maxAllowedUnits, affordable);
        }
      }

      remainingSmelters -= maxAllowedUnits;
      const delta = maxAllowedUnits - fuel.currentFuelCount;
      if (delta !== 0) {
        fuelAdjustments.push(
          Object.freeze({
            fuelId: fuel.id,
            expectedCurrentFuelCount: fuel.currentFuelCount,
            delta,
          }),
        );
      }
      if (delta < 0) {
        fuelRemoved += -delta;
      }
    }
    totalSmelters -= remainingSmelters;
  }

  totalSmelters += input.extraOperating;

  const smelterIronCount = input.ironCount;
  const smelterSteelCount = input.steelCount;
  const smelterIridiumCount = input.iridiumCount;

  const maxAllowedIridium =
    input.iridiumUnlocked && !input.iridiumCapped
      ? Math.floor(input.productionSmeltingIridium * totalSmelters)
      : 0;
  let maxAllowedSteel = totalSmelters - smelterIridiumCount;

  const smeltAdjust: Record<SmelterProductionId, number> = {
    Iridium: maxAllowedIridium - smelterIridiumCount,
    Steel: smelterIridiumCount - maxAllowedIridium,
    Iron: 0,
  };

  // Adjusting fuel can move production from steel to iron, we need to account that.
  if (fuelRemoved > smelterIronCount) {
    const steelRemoved = fuelRemoved - smelterIronCount;
    if (steelRemoved <= smelterSteelCount) {
      smeltAdjust.Steel += steelRemoved;
    } else {
      smeltAdjust.Steel += smelterSteelCount;
      smeltAdjust.Iridium += steelRemoved - smelterSteelCount;
    }
  }

  for (const cost of input.steelCost) {
    if (costLimitsUnits(cost, smelterSteelCount, input.consumptionBalanceMin)) {
      const affordable = affordableUnits(cost, smelterSteelCount);
      if (affordable < maxAllowedSteel) {
        tooltips.push({
          key: "smelterMatssteel",
          value: `Too low ${cost.resourceName} income<br>`,
        });
      }
      maxAllowedSteel = Math.min(maxAllowedSteel, affordable);
    }
  }

  let ironWeighting = 0;
  let steelWeighting = 0;
  switch (input.productionSmelting) {
    case "iron":
      ironWeighting = input.ironTimeToFull;
      if (!ironWeighting) {
        steelWeighting = input.steelTimeToFull;
      }
      break;
    case "steel":
      steelWeighting = input.steelTimeToFull;
      if (!steelWeighting) {
        ironWeighting = input.ironTimeToFull;
      }
      break;
    case "storage":
      ironWeighting = input.ironTimeToFull;
      steelWeighting = input.steelTimeToFull;
      break;
    case "required":
      ironWeighting = input.ironTimeToRequired;
      steelWeighting = input.steelTimeToRequired;
      break;
  }

  if (input.ironDemanded) {
    ironWeighting = Number.MAX_SAFE_INTEGER;
  }
  if (input.steelDemanded) {
    steelWeighting = Number.MAX_SAFE_INTEGER;
  }
  if (input.minerCount === 0 && input.beltIronShipStateOnCount === 0) {
    ironWeighting = 0;
    steelWeighting = 1;
    maxAllowedSteel = totalSmelters - smelterIridiumCount;
  }

  // We have more steel than we can afford OR iron income is too low.
  if (
    smelterSteelCount > maxAllowedSteel ||
    (smelterSteelCount > 0 && ironWeighting > steelWeighting)
  ) {
    smeltAdjust.Steel--;
  }

  // We can afford more steel AND either steel income is too low OR both steel
  // and iron full, but we can use steel smelters to increase titanium income.
  if (
    smelterSteelCount < maxAllowedSteel &&
    smelterIronCount > 0 &&
    (steelWeighting > ironWeighting ||
      (steelWeighting <= 0 &&
        ironWeighting <= 0 &&
        input.titaniumStorageRatio < 0.99 &&
        input.haveTitaniumTech))
  ) {
    smeltAdjust.Steel++;
  }

  smeltAdjust.Iron =
    totalSmelters -
    (smelterIronCount +
      smelterSteelCount +
      smeltAdjust.Steel +
      smelterIridiumCount +
      smeltAdjust.Iridium);

  const expectedByProduction: Record<SmelterProductionId, number> = {
    Iron: smelterIronCount,
    Steel: smelterSteelCount,
    Iridium: smelterIridiumCount,
  };
  const smeltAdjustments = (
    Object.entries(smeltAdjust) as [SmelterProductionId, number][]
  ).map(([productionId, delta]) =>
    Object.freeze({
      productionId,
      expectedCurrentCount: expectedByProduction[productionId],
      delta,
    }),
  );

  return Object.freeze({
    fuelAdjustments: Object.freeze(fuelAdjustments),
    smeltAdjustments: Object.freeze(smeltAdjustments),
    tooltips: Object.freeze(tooltips),
  });
}
