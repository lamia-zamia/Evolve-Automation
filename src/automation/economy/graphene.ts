import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<"GrapheneManager" | "getResources">;
import { CONSUMPTION_BALANCE_MIN } from "../../config.js";

export function createAutoGraphenePlant({
  GrapheneManager,
  getResources,
}: Dependencies) {
  return function autoGraphenePlant() {
    const resources = getResources();
    // If not unlocked then nothing to do
    if (!GrapheneManager.initIndustry()) {
      return;
    }

    let remainingPlants = GrapheneManager.maxOperating();
    let fuelAdjust = [];

    let sortedFuel = (Object.values(GrapheneManager.Fuels) as any[]).sort(
      (a, b) =>
        b.cost.resource.storageRatio < 0.995 ||
        a.cost.resource.storageRatio < 0.995
          ? b.cost.resource.storageRatio - a.cost.resource.storageRatio
          : b.cost.resource.rateOfChange - a.cost.resource.rateOfChange,
    );
    for (let fuel of sortedFuel) {
      if (remainingPlants === 0) {
        break;
      }

      let resource = fuel.cost.resource;
      if (!resource.isUnlocked()) {
        continue;
      }

      let currentFuelCount = GrapheneManager.fueledCount(fuel);
      let maxFueledForConsumption = remainingPlants;
      if (!resources.Graphene.isUseful()) {
        maxFueledForConsumption = 0;
      } else if (
        resource.currentQuantity <
        maxFueledForConsumption * fuel.cost.quantity * CONSUMPTION_BALANCE_MIN +
          fuel.cost.minRateOfChange
      ) {
        let rateOfChange =
          resource.rateOfChange +
          fuel.cost.quantity * currentFuelCount -
          fuel.cost.minRateOfChange;

        let affordableAmount = Math.floor(rateOfChange / fuel.cost.quantity);
        maxFueledForConsumption = Math.max(
          Math.min(maxFueledForConsumption, affordableAmount),
          0,
        );
      }

      let deltaFuel = maxFueledForConsumption - currentFuelCount;
      if (deltaFuel !== 0) {
        fuelAdjust.push({ res: fuel, delta: deltaFuel });
      }

      remainingPlants -= currentFuelCount + deltaFuel;
    }

    fuelAdjust.forEach(
      (fuel) =>
        fuel.delta < 0 &&
        GrapheneManager.decreaseFuel(fuel.res, fuel.delta * -1),
    );
    fuelAdjust.forEach(
      (fuel) =>
        fuel.delta > 0 && GrapheneManager.increaseFuel(fuel.res, fuel.delta),
    );
  };
}
