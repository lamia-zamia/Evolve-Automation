import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  | "FactoryManager"
  | "getState"
  | "getSettings"
  | "getGame"
  | "getResources"
  | "findRequiredResourceWeight"
>;
import { CONSUMPTION_BALANCE_MIN } from "../../config.js";

export function createAutoFactory({
  FactoryManager,
  getState,
  getSettings,
  getGame,
  getResources,
  findRequiredResourceWeight,
}: Dependencies) {
  return function autoFactory() {
    const state = getState();
    const settings = getSettings();
    const game = getGame();
    const resources = getResources();
    // No factory; no auto factory
    if (!FactoryManager.initIndustry()) {
      return;
    }

    let allProducts = Object.values(FactoryManager.Productions) as any[];

    // Init adjustment, and sort groups by priorities
    let priorityGroups = {};
    let factoryAdjustments = {};
    for (let i = 0; i < allProducts.length; i++) {
      let production = allProducts[i];
      state.tooltips["iFactory" + production.id] = `Disabled<br>`;
      if (production.unlocked && production.enabled) {
        if (production.weighting > 0) {
          let priority = production.resource.isDemanded()
            ? Math.max(production.priority, 100)
            : production.priority;
          if (priority !== 0) {
            priorityGroups[priority] = priorityGroups[priority] ?? [];
            priorityGroups[priority].push(production);
            state.tooltips["iFactory" + production.id] = `Low priority<br>`;
          }
        }
        factoryAdjustments[production.id] = 0;
      }
    }
    let priorityList = (Object.keys(priorityGroups) as any[])
      .sort((a, b) => b - a)
      .map((key) => priorityGroups[key]);
    if (priorityGroups["-1"] && priorityList.length > 1) {
      priorityList.splice(priorityList.indexOf(priorityGroups["-1"], 1));
      priorityList[0].push(...priorityGroups["-1"]);
    }

    let onDemand = false;
    if (settings.productionFactoryWeighting === "demanded") {
      let usefulProducts = allProducts.filter(
        (production) =>
          production.resource.currentQuantity <
          production.resource.storageRequired,
      );
      if (usefulProducts.length > 0) {
        onDemand = true;
      }
    }

    const scalingFactor =
      settings.productionFactoryWeighting === "buildings" &&
      state.unlockedBuildings.length > 0
        ? (resource) => findRequiredResourceWeight(resource) ?? 100
        : settings.productionFactoryWeighting === "demanded" && onDemand
          ? (resource) =>
              resource.currentQuantity < resource.storageRequired ? 1 : 0
          : () => 1;
    const scaledWeights = Object.fromEntries(
      allProducts.map((production) => [
        production.resource.id,
        production.weighting * scalingFactor(production.resource),
      ]),
    );

    // Calculate amount of factories per product
    let remainingFactories = FactoryManager.maxOperating();
    for (let i = 0; i < priorityList.length && remainingFactories > 0; i++) {
      let products = priorityList[i].sort(
        (a, b) => scaledWeights[a.resource.id] - scaledWeights[b.resource.id],
      );
      while (remainingFactories > 0) {
        let factoriesToDistribute = remainingFactories;
        let totalPriorityWeight = products.reduce(
          (sum, production) => sum + scaledWeights[production.resource.id],
          0,
        );

        for (
          let j = products.length - 1;
          j >= 0 && remainingFactories > 0;
          j--
        ) {
          let production = products[j];
          state.tooltips["iFactory" + production.id] = ``;

          let calculatedRequiredFactories = Math.min(
            remainingFactories,
            Math.max(
              1,
              Math.floor(
                (factoriesToDistribute / totalPriorityWeight) *
                  scaledWeights[production.resource.id],
              ),
            ),
          );
          let actualRequiredFactories = calculatedRequiredFactories;

          if (!production.resource.isUseful()) {
            actualRequiredFactories = 0;
            state.tooltips["iFactory" + production.id] += `Resource capped<br>`;
          }

          for (let resourceCost of production.cost) {
            let usedMaterial = resourceCost.resource;
            if (!usedMaterial.isUnlocked()) {
              continue;
            }
            if (!production.resource.isDemanded()) {
              if (!settings.useDemanded && usedMaterial.isDemanded()) {
                actualRequiredFactories = 0;
                state.tooltips["iFactory" + production.id] +=
                  `${usedMaterial.name} is demanded<br>`;
                break;
              }
              if (
                usedMaterial.storageRatio <
                settings.productionFactoryMinIngredients
              ) {
                actualRequiredFactories = 0;
                state.tooltips["iFactory" + production.id] +=
                  `${usedMaterial.name} under min materials ratio<br>`;
                break;
              }
            }
            // No need to preserve minimum income when we have enough storage for 60s of running
            // We can't demand it here, though, due to order of operations
            // Elsewhere, prioritizeDemandedResources() demands a few specific materials.
            if (
              usedMaterial.currentQuantity <
                actualRequiredFactories *
                  resourceCost.quantity *
                  CONSUMPTION_BALANCE_MIN +
                  resourceCost.minRateOfChange ||
              usedMaterial.isDemanded()
            ) {
              let previousCost =
                FactoryManager.currentProduction(production) *
                resourceCost.quantity;
              let currentCost =
                factoryAdjustments[production.id] * resourceCost.quantity;
              let rate =
                usedMaterial.rateOfChange +
                previousCost -
                currentCost -
                resourceCost.minRateOfChange;

              if (production.resource.isDemanded()) {
                rate += usedMaterial.currentQuantity;
              }
              let affordableAmount = Math.floor(rate / resourceCost.quantity);
              if (affordableAmount < 1) {
                state.tooltips["iFactory" + production.id] +=
                  `Too low ${usedMaterial.name} income<br>`;
              }
              actualRequiredFactories = Math.min(
                actualRequiredFactories,
                affordableAmount,
              );
            }
          }

          // If we're going for bioseed - try to balance neutronium\nanotubes ratio
          if (
            settings.prestigeType === "bioseed" &&
            settings.prestigeBioseedConstruct &&
            production === FactoryManager.Productions.NanoTube
          ) {
            let reservedNeutronium = game.global.race["truepath"] ? 500 : 250;
            if (resources.Neutronium.currentQuantity < reservedNeutronium) {
              state.tooltips["iFactory" + production.id] +=
                `${reservedNeutronium} ${resources.Neutronium.name} reserved<br>`;
              actualRequiredFactories = 0;
            }
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

    // First decrease any production so that we have room to increase others
    for (let production of allProducts) {
      if (factoryAdjustments[production.id] !== undefined) {
        let deltaAdjustments =
          factoryAdjustments[production.id] -
          FactoryManager.currentProduction(production);

        if (deltaAdjustments < 0) {
          FactoryManager.decreaseProduction(production, deltaAdjustments * -1);
        }
      }
    }

    // Increase any production required (if they are 0 then don't do anything with them)
    for (let production of allProducts) {
      if (factoryAdjustments[production.id] !== undefined) {
        let deltaAdjustments =
          factoryAdjustments[production.id] -
          FactoryManager.currentProduction(production);

        if (deltaAdjustments > 0) {
          FactoryManager.increaseProduction(production, deltaAdjustments);
        }
      }
    }
  };
}
