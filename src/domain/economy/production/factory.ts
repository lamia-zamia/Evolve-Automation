export interface FactoryMaterialInput {
  readonly resourceId: string;
  readonly name: string;
  readonly unlocked: boolean;
  readonly demanded: boolean;
  readonly currentQuantity: number;
  readonly rateOfChange: number;
  readonly storageRatio: number;
  readonly quantity: number;
  readonly minRateOfChange: number;
}

export interface FactoryProductionInput {
  readonly id: string;
  readonly outputResourceId: string;
  readonly unlocked: boolean;
  readonly enabled: boolean;
  readonly weighting: number;
  readonly priority: number;
  readonly demanded: boolean;
  readonly useful: boolean;
  readonly currentQuantity: number;
  readonly storageRequired: number;
  readonly buildingWeight: number;
  readonly currentProduction: number;
  readonly isNanoTube: boolean;
  readonly costs: readonly FactoryMaterialInput[];
}

export interface FactoryInput {
  readonly initialized: boolean;
  readonly maximum: number;
  readonly weightingMode: string;
  readonly hasUnlockedBuildings: boolean;
  readonly useDemandedMaterials: boolean;
  readonly minimumIngredientRatio: number;
  readonly consumptionBalanceMinimum: number;
  readonly bioseedConstruct: boolean;
  readonly truepath: boolean;
  readonly neutroniumCurrent: number;
  readonly neutroniumName: string;
  readonly productions: readonly FactoryProductionInput[];
}

export interface FactoryTooltip {
  readonly key: string;
  readonly value: string;
}

export interface FactoryAdjustment {
  readonly productionId: string;
  readonly outputResourceId: string;
  readonly expectedCurrent: number;
  readonly delta: number;
}

export interface FactoryDecision {
  readonly expectedMaximum: number;
  readonly adjustments: readonly FactoryAdjustment[];
  readonly tooltips: readonly FactoryTooltip[];
}

function setTooltip(
  tooltips: Map<string, string>,
  productionId: string,
  value: string,
): void {
  tooltips.set(`iFactory${productionId}`, value);
}

function appendTooltip(
  tooltips: Map<string, string>,
  productionId: string,
  value: string,
): void {
  const key = `iFactory${productionId}`;
  tooltips.set(key, (tooltips.get(key) ?? "") + value);
}

/** Pure equivalent of the legacy weighted factory allocator. */
export function planFactory(
  input: Readonly<FactoryInput>,
): FactoryDecision | null {
  if (!input.initialized) return null;

  const tooltips = new Map<string, string>();
  const priorityGroups = new Map<number, FactoryProductionInput[]>();
  const targets = new Map<string, number>();
  for (const production of input.productions) {
    setTooltip(tooltips, production.id, "Disabled<br>");
    if (production.unlocked && production.enabled) {
      if (production.weighting > 0) {
        const priority = production.demanded
          ? Math.max(production.priority, 100)
          : production.priority;
        if (priority !== 0) {
          const group = priorityGroups.get(priority) ?? [];
          group.push(production);
          priorityGroups.set(priority, group);
          setTooltip(tooltips, production.id, "Low priority<br>");
        }
      }
      targets.set(production.id, 0);
    }
  }
  const priorityList = [...priorityGroups.entries()]
    .sort(([left], [right]) => right - left)
    .map(([, group]) => group);
  const supplementary = priorityGroups.get(-1);
  if (supplementary !== undefined && priorityList.length > 1) {
    priorityList.splice(priorityList.indexOf(supplementary, 1));
    priorityList[0]?.push(...supplementary);
  }

  const onDemand =
    input.weightingMode === "demanded" &&
    input.productions.some(
      (production) => production.currentQuantity < production.storageRequired,
    );
  const scaledWeights = new Map<string, number>();
  for (const production of input.productions) {
    const scale =
      input.weightingMode === "buildings" && input.hasUnlockedBuildings
        ? production.buildingWeight
        : input.weightingMode === "demanded" && onDemand
          ? production.currentQuantity < production.storageRequired
            ? 1
            : 0
          : 1;
    scaledWeights.set(
      production.outputResourceId,
      production.weighting * scale,
    );
  }

  let remaining = input.maximum;
  for (
    let groupIndex = 0;
    groupIndex < priorityList.length && remaining > 0;
    groupIndex++
  ) {
    const products = [...(priorityList[groupIndex] ?? [])].sort(
      (left, right) =>
        (scaledWeights.get(left.outputResourceId) ?? 0) -
        (scaledWeights.get(right.outputResourceId) ?? 0),
    );
    while (remaining > 0) {
      const beforeDistribution = remaining;
      const totalWeight = products.reduce(
        (sum, production) =>
          sum + (scaledWeights.get(production.outputResourceId) ?? 0),
        0,
      );
      for (
        let index = products.length - 1;
        index >= 0 && remaining > 0;
        index--
      ) {
        const production = products[index];
        if (production === undefined) continue;
        setTooltip(tooltips, production.id, "");
        const calculated = Math.min(
          remaining,
          Math.max(
            1,
            Math.floor(
              (beforeDistribution / totalWeight) *
                (scaledWeights.get(production.outputResourceId) ?? 0),
            ),
          ),
        );
        let actual = calculated;
        if (!production.useful) {
          actual = 0;
          appendTooltip(tooltips, production.id, "Resource capped<br>");
        }

        for (const cost of production.costs) {
          if (!cost.unlocked) continue;
          if (!production.demanded) {
            if (!input.useDemandedMaterials && cost.demanded) {
              actual = 0;
              appendTooltip(
                tooltips,
                production.id,
                `${cost.name} is demanded<br>`,
              );
              break;
            }
            if (cost.storageRatio < input.minimumIngredientRatio) {
              actual = 0;
              appendTooltip(
                tooltips,
                production.id,
                `${cost.name} under min materials ratio<br>`,
              );
              break;
            }
          }
          if (
            cost.currentQuantity <
              actual * cost.quantity * input.consumptionBalanceMinimum +
                cost.minRateOfChange ||
            cost.demanded
          ) {
            const previousCost = production.currentProduction * cost.quantity;
            const currentCost =
              (targets.get(production.id) ?? 0) * cost.quantity;
            let rate =
              cost.rateOfChange +
              previousCost -
              currentCost -
              cost.minRateOfChange;
            if (production.demanded) rate += cost.currentQuantity;
            const affordable = Math.floor(rate / cost.quantity);
            if (affordable < 1) {
              appendTooltip(
                tooltips,
                production.id,
                `Too low ${cost.name} income<br>`,
              );
            }
            actual = Math.min(actual, affordable);
          }
        }

        if (
          input.bioseedConstruct &&
          production.isNanoTube &&
          input.neutroniumCurrent < (input.truepath ? 500 : 250)
        ) {
          const reserved = input.truepath ? 500 : 250;
          appendTooltip(
            tooltips,
            production.id,
            `${reserved} ${input.neutroniumName} reserved<br>`,
          );
          actual = 0;
        }

        if (actual > 0) {
          remaining -= actual;
          targets.set(
            production.id,
            (targets.get(production.id) ?? 0) + actual,
          );
        }
        if (actual < calculated) products.splice(index, 1);
      }
      if (beforeDistribution === remaining) break;
    }
  }

  return Object.freeze({
    expectedMaximum: input.maximum,
    adjustments: Object.freeze(
      input.productions.flatMap((production) =>
        targets.has(production.id)
          ? [
              Object.freeze({
                productionId: production.id,
                outputResourceId: production.outputResourceId,
                expectedCurrent: production.currentProduction,
                delta:
                  (targets.get(production.id) ?? 0) -
                  production.currentProduction,
              }),
            ]
          : [],
      ),
    ),
    tooltips: Object.freeze(
      [...tooltips.entries()].map(([key, value]) =>
        Object.freeze({ key, value }),
      ),
    ),
  });
}
