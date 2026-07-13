import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<"DroidManager">;
export function createAutoMiningDroid({ DroidManager }: Dependencies) {
  return function autoMiningDroid() {
    // If not unlocked then nothing to do
    if (!DroidManager.initIndustry()) {
      return;
    }

    let allProducts = Object.values(DroidManager.Productions) as any[];

    // Init adjustment, and sort groups by priorities
    let priorityGroups = {};
    let factoryAdjustments = {};
    for (let i = 0; i < allProducts.length; i++) {
      let production = allProducts[i];
      if (production.weighting > 0) {
        let priority = production.resource.isDemanded()
          ? Math.max(production.priority, 100)
          : production.priority;
        if (priority !== 0) {
          priorityGroups[priority] = priorityGroups[priority] ?? [];
          priorityGroups[priority].push(production);
        }
      }
      factoryAdjustments[production.id] = 0;
    }
    let priorityList = (Object.keys(priorityGroups) as any[])
      .sort((a, b) => b - a)
      .map((key) => priorityGroups[key]);
    if (priorityGroups["-1"] && priorityList.length > 1) {
      priorityList.splice(priorityList.indexOf(priorityGroups["-1"], 1));
      priorityList[0].push(...priorityGroups["-1"]);
    }

    // Calculate amount of factories per product
    let remainingFactories = DroidManager.maxOperating();
    for (let i = 0; i < priorityList.length && remainingFactories > 0; i++) {
      let products = priorityList[i].sort((a, b) => a.weighting - b.weighting);
      while (remainingFactories > 0) {
        let factoriesToDistribute = remainingFactories;
        let totalPriorityWeight = products.reduce(
          (sum, production) => sum + production.weighting,
          0,
        );

        for (
          let j = products.length - 1;
          j >= 0 && remainingFactories > 0;
          j--
        ) {
          let production = products[j];

          let calculatedRequiredFactories = Math.min(
            remainingFactories,
            Math.max(
              1,
              Math.floor(
                (factoriesToDistribute / totalPriorityWeight) *
                  production.weighting,
              ),
            ),
          );
          let actualRequiredFactories = calculatedRequiredFactories;
          if (!production.resource.isUseful()) {
            actualRequiredFactories = 0;
          }

          if (actualRequiredFactories > 0) {
            remainingFactories -= actualRequiredFactories;
            factoryAdjustments[production.id] += actualRequiredFactories;
          }

          // We assigned less than wanted, i.e. we either don't need this product, or can't afford it. In both cases - we're done with it.
          if (actualRequiredFactories < calculatedRequiredFactories) {
            products.splice(j, 1);
          }
        }

        if (factoriesToDistribute === remainingFactories) {
          break;
        }
      }
    }
    if (remainingFactories > 0) {
      return;
    }

    // First decrease any production so that we have room to increase others
    for (let production of allProducts) {
      if (factoryAdjustments[production.id] !== undefined) {
        let deltaAdjustments =
          factoryAdjustments[production.id] -
          DroidManager.currentProduction(production);

        if (deltaAdjustments < 0) {
          DroidManager.decreaseProduction(production, deltaAdjustments * -1);
        }
      }
    }

    // Increase any production required (if they are 0 then don't do anything with them)
    for (let production of allProducts) {
      if (factoryAdjustments[production.id] !== undefined) {
        let deltaAdjustments =
          factoryAdjustments[production.id] -
          DroidManager.currentProduction(production);

        if (deltaAdjustments > 0) {
          DroidManager.increaseProduction(production, deltaAdjustments);
        }
      }
    }
  };
}
