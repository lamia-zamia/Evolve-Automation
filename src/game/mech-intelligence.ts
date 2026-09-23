import { canSpendWithDistantReservation } from "../domain/economy/resources/reservation.ts";
import type { MechSupplySavingReason } from "../domain/progression/build/building-weighting.ts";

type MechBay = {
  max: number;
  bay: number;
  blueprint: { size: string };
};

type MechManager = {
  isActive: boolean;
  /** Preferred sizes, best first. The game always offers at least one. */
  getPreferredSize: () => [string, ...string[]];
  getMechCost: (design: { size: string }) => [number, number, number];
};

type MechResource = {
  maxQuantity: number;
  currentQuantity: number;
  spareQuantity: number;
  rateOfChange: number;
};

type MechIntelligenceDependencies = {
  getGame: () => { global: { portal: { mechbay: MechBay } } };
  getSettings: () => {
    autoMech: boolean;
    mechBuild: string;
    buildingMechsFirst: boolean;
  };
  getBuildings: () => {
    SpireMechBay: { count: number; stateOffCount: number };
  };
  getResources: () => { Supply: MechResource; Soul_Gem: MechResource };
  getMechManager: () => MechManager;
  getHaveTask: () => (task: string) => unknown;
};

export function createMechIntelligence({
  getGame,
  getSettings,
  getBuildings,
  getResources,
  getMechManager,
  getHaveTask,
}: MechIntelligenceDependencies) {
  // Supply-costing buildings are being held back for the mech bay: either a mech
  // is already under construction, or the next one fits the bay and is
  // affordable, so spending Supply elsewhere would delay it.
  //
  // The settings and bay checks gate the rest. `getMechCost` prices a whole
  // design and `getPreferredSize` scans the bay, and neither is worth doing in a
  // run that is not building mechs.
  function mechSupplySavingReason(): MechSupplySavingReason | null {
    const settings = getSettings();
    if (
      !settings.autoMech ||
      settings.mechBuild === "none" ||
      !settings.buildingMechsFirst
    ) {
      return null;
    }
    const spireMechBay = getBuildings().SpireMechBay;
    if (spireMechBay.count === 0 || spireMechBay.stateOffCount !== 0) {
      return null;
    }
    const manager = getMechManager();
    if (manager.isActive) {
      return "building";
    }
    const mechbay = getGame().global.portal.mechbay;
    // A forced mech task always builds a titan; otherwise the size is whatever
    // the configured build mode would pick next.
    const size = getHaveTask()("mech")
      ? "titan"
      : settings.mechBuild === "random"
        ? manager.getPreferredSize()[0]
        : mechbay.blueprint.size;
    const [gems, supply, space] = manager.getMechCost({ size });
    const resources = getResources();
    const affordable =
      space <= mechbay.max - mechbay.bay &&
      supply <= resources.Supply.maxQuantity &&
      canSpendWithDistantReservation(
        {
          current: resources.Soul_Gem.currentQuantity,
          spare: resources.Soul_Gem.spareQuantity,
          rate: resources.Soul_Gem.rateOfChange,
        },
        gems,
      );
    return affordable ? "saving" : null;
  }

  return { mechSupplySavingReason };
}
