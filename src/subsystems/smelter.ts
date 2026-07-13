import type { SubsystemDependencies } from "./types.ts";

type Dependencies = SubsystemDependencies<
  | "SmelterManager"
  | "getGame"
  | "getState"
  | "getSettings"
  | "getResources"
  | "getJobs"
  | "getBuildings"
  | "haveTech"
>;
import { CONSUMPTION_BALANCE_MIN } from "../config.js";

export function createAutoSmelter({
  SmelterManager,
  getGame,
  getState,
  getSettings,
  getResources,
  getJobs,
  getBuildings,
  haveTech,
}: Dependencies) {
  return function autoSmelter() {
    const game = getGame();
    const state = getState();
    const settings = getSettings();
    const resources = getResources();
    const jobs = getJobs();
    const buildings = getBuildings();

    // No smelter; no auto smelter. No soup for you.
    let m = SmelterManager;
    if (!m.initIndustry()) {
      return;
    }

    // Only adjust fuels if race does not have forge trait which means they don't require smelter fuel
    let totalSmelters = m.maxOperating();
    let fuelRemoved = 0;
    if (!game.global.race["forge"]) {
      let remainingSmelters = totalSmelters;

      let fuels = m.managedFuelPriorityList();
      let fuelAdjust = {};
      for (let i = 0; i < fuels.length; i++) {
        let fuel = fuels[i];
        if (!fuel.unlocked) {
          continue;
        }

        let maxAllowedUnits = remainingSmelters;

        // Adjust Inferno to Oil ratio for better efficiency and cost
        if (
          fuel === m.Fuels.Inferno &&
          fuels[i + 1] === m.Fuels.Oil &&
          remainingSmelters > 75
        ) {
          maxAllowedUnits = Math.floor(0.5 * remainingSmelters + 37.5);
        }

        for (let productionCost of fuel.cost) {
          let resource = productionCost.resource;
          // Allow using all resources for fuel until 60s of consumption left, unless demanded.
          if (
            resource.currentQuantity <
              maxAllowedUnits *
                productionCost.quantity *
                CONSUMPTION_BALANCE_MIN +
                productionCost.minRateOfChange ||
            resource.isDemanded()
          ) {
            let remainingRateOfChange =
              resource.rateOfChange +
              m.fueledCount(fuel) * productionCost.quantity -
              productionCost.minRateOfChange;

            let affordableAmount = Math.max(
              0,
              Math.floor(remainingRateOfChange / productionCost.quantity),
            );
            if (affordableAmount < maxAllowedUnits) {
              state.tooltips["smelterFuels" + fuel.id.toLowerCase()] =
                `Too low ${resource.name} income<br>`;
            }
            maxAllowedUnits = Math.min(maxAllowedUnits, affordableAmount);
          }
        }

        remainingSmelters -= maxAllowedUnits;
        fuelAdjust[fuel.id] = maxAllowedUnits - m.fueledCount(fuel);
      }

      for (let fuel of fuels) {
        if (fuelAdjust[fuel.id] < 0) {
          fuelRemoved += fuelAdjust[fuel.id] * -1;
          m.decreaseFuel(fuel, fuelAdjust[fuel.id] * -1);
        }
      }

      for (let fuel of fuels) {
        if (fuelAdjust[fuel.id] > 0) {
          m.increaseFuel(fuel, fuelAdjust[fuel.id]);
        }
      }
      totalSmelters -= remainingSmelters;
    }

    totalSmelters += m.extraOperating();

    let smelterIronCount = m.smeltingCount(m.Productions.Iron);
    let smelterSteelCount = m.smeltingCount(m.Productions.Steel);
    let smelterIridiumCount = m.smeltingCount(m.Productions.Iridium);

    let maxAllowedIridium =
      m.Productions.Iridium.unlocked && !resources.Iridium.isCapped()
        ? Math.floor(settings.productionSmeltingIridium * totalSmelters)
        : 0;
    let maxAllowedSteel = totalSmelters - smelterIridiumCount;

    let smeltAdjust: Record<string, number> = {
      Iridium: maxAllowedIridium - smelterIridiumCount,
      Steel: smelterIridiumCount - maxAllowedIridium,
    };

    // Adjusting fuel can move production from steel to iron, we need to account that
    if (fuelRemoved > smelterIronCount) {
      let steelRemoved = fuelRemoved - smelterIronCount;
      if (steelRemoved <= smelterSteelCount) {
        smeltAdjust.Steel += steelRemoved;
      } else {
        smeltAdjust.Steel += smelterSteelCount;
        smeltAdjust.Iridium += steelRemoved - smelterSteelCount;
      }
    }

    // We only care about steel. It isn't worth doing a full generic calculation here
    // Just assume that smelters will always be fueled so Iron smelting is unlimited
    // We want to work out the maximum steel smelters that we can have based on our resource consumption
    let steelSmeltingConsumption = m.Productions.Steel.cost;
    for (let productionCost of steelSmeltingConsumption) {
      let resource = productionCost.resource;
      // Allow using all resources for Steel until 60s of consumption left, unless demanded.
      if (
        resource.currentQuantity <
          smelterSteelCount *
            productionCost.quantity *
            CONSUMPTION_BALANCE_MIN +
            productionCost.minRateOfChange ||
        resource.isDemanded()
      ) {
        let remainingRateOfChange =
          resource.rateOfChange +
          smelterSteelCount * productionCost.quantity -
          productionCost.minRateOfChange;

        let affordableAmount = Math.max(
          0,
          Math.floor(remainingRateOfChange / productionCost.quantity),
        );
        if (affordableAmount < maxAllowedSteel) {
          state.tooltips["smelterMatssteel"] =
            `Too low ${resource.name} income<br>`;
        }
        maxAllowedSteel = Math.min(maxAllowedSteel, affordableAmount);
      }
    }

    let ironWeighting = 0;
    let steelWeighting = 0;
    switch (settings.productionSmelting) {
      case "iron":
        ironWeighting = resources.Iron.timeToFull;
        if (!ironWeighting) {
          steelWeighting = resources.Steel.timeToFull;
        }
        break;
      case "steel":
        steelWeighting = resources.Steel.timeToFull;
        if (!steelWeighting) {
          ironWeighting = resources.Iron.timeToFull;
        }
        break;
      case "storage":
        ironWeighting = resources.Iron.timeToFull;
        steelWeighting = resources.Steel.timeToFull;
        break;
      case "required":
        ironWeighting = resources.Iron.timeToRequired;
        steelWeighting = resources.Steel.timeToRequired;
        break;
    }

    if (resources.Iron.isDemanded()) {
      ironWeighting = Number.MAX_SAFE_INTEGER;
    }
    if (resources.Steel.isDemanded()) {
      steelWeighting = Number.MAX_SAFE_INTEGER;
    }
    if (jobs.Miner.count === 0 && buildings.BeltIronShip.stateOnCount === 0) {
      ironWeighting = 0;
      steelWeighting = 1;
      maxAllowedSteel = totalSmelters - smelterIridiumCount;
    }

    // We have more steel than we can afford OR iron income is too low
    if (
      smelterSteelCount > maxAllowedSteel ||
      (smelterSteelCount > 0 && ironWeighting > steelWeighting)
    ) {
      smeltAdjust.Steel--;
    }

    // We can afford more steel AND either steel income is too low OR both steel and iron full, but we can use steel smelters to increase titanium income
    if (
      smelterSteelCount < maxAllowedSteel &&
      smelterIronCount > 0 &&
      (steelWeighting > ironWeighting ||
        (steelWeighting <= 0 &&
          ironWeighting <= 0 &&
          resources.Titanium.storageRatio < 0.99 &&
          haveTech("titanium")))
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
    Object.entries(smeltAdjust).forEach(
      ([id, delta]) => delta < 0 && m.decreaseSmelting(id, delta * -1),
    );
    Object.entries(smeltAdjust).forEach(
      ([id, delta]) => delta > 0 && m.increaseSmelting(id, delta),
    );
  };
}
