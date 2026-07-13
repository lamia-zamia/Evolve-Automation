type DemandResource = {
  maxQuantity: number;
  requestQuantity: (amount: number) => void;
  isDemanded?: () => boolean;
  isUnlocked?: () => boolean;
  craftPreserve?: number;
  cost?: Record<string, number>;
};

type DemandedObject = {
  cost: Record<string, number>;
  progress?: number;
  isAffordable?: (max?: boolean) => boolean;
};

type Mission = DemandedObject & {
  autoBuildEnabled: boolean;
  isUnlocked: () => boolean;
  isComplete: () => boolean;
};

type ProductionCost = {
  quantity: number;
  minRateOfChange?: number;
  resource: DemandResource;
};

type FactoryProduction = {
  resource: DemandResource;
  unlocked: boolean;
  enabled: boolean;
  weighting: number;
  cost: ProductionCost | ProductionCost[];
};

type DemandPrioritizationDependencies = {
  getSettings: () => {
    prioritizeQueue: string;
    prioritizeTriggers: string;
    missionRequest: boolean;
    prestigeBioseedConstruct: boolean;
    prestigeType: string;
    researchRequest: boolean;
    researchRequestSpace: boolean;
    prioritizeUnify: string;
    autoFleet: boolean;
    prioritizeOuterFleet: string;
    productionFactoryFocusMaterials: boolean;
    autoPower: boolean;
    productionFactoryMinIngredients: number;
  };
  getState: () => {
    queuedTargets: DemandedObject[];
    triggerTargets: DemandedObject[];
    missionBuildingList: Mission[];
    unlockedTechs: DemandedObject[];
  };
  getResources: () => Record<string, DemandResource> & {
    Money: DemandResource;
    Graphene: DemandResource;
    Stanene: DemandResource;
  };
  getBuildings: () => {
    BlackholeJumpShip: Mission;
    Alien1VitreloyPlant: {
      autoStateEnabled: boolean;
      count: number;
      stateOnCount: number;
    };
  };
  getCrafter: () => Record<string, { resource: DemandResource }>;
  getSpyManager: () => { purchaseMoney: number };
  getFleetManagerOuter: () => {
    nextShipAffordable: boolean;
    nextShipCost: Record<string, number>;
  };
  getJobManager: () => {
    craftingMax: () => number;
    skilledServantsMax: () => number;
  };
  getFactoryManager: () => {
    maxOperating: () => number;
    Productions: Record<string, FactoryProduction>;
  };
  getIsEarlyGame: () => () => unknown;
  isProject: (object: DemandedObject) => boolean;
  getInflationChallengeAssistActive: () => () => boolean;
  getRetirementChallengeAssistActive: () => () => boolean;
  getInflationChallengeMoney: () => number;
  getRetirementGraphene: () => number;
  consumptionBalanceTarget: number;
};

export function createDemandPrioritization({
  getSettings,
  getState,
  getResources,
  getBuildings,
  getCrafter,
  getSpyManager,
  getFleetManagerOuter,
  getJobManager,
  getFactoryManager,
  getIsEarlyGame,
  isProject,
  getInflationChallengeAssistActive,
  getRetirementChallengeAssistActive,
  getInflationChallengeMoney,
  getRetirementGraphene,
  consumptionBalanceTarget,
}: DemandPrioritizationDependencies) {
  function prioritizeDemandedResources() {
    const settings = getSettings();
    const state = getState();
    const resources = getResources();
    const buildings = getBuildings();
    let prioritizedTasks: DemandedObject[] = [];
    if (getInflationChallengeAssistActive()()) {
      resources.Money.requestQuantity(getInflationChallengeMoney());
    }
    if (getRetirementChallengeAssistActive()()) {
      resources.Graphene.requestQuantity(getRetirementGraphene());
    }
    if (settings.prioritizeQueue.includes("req")) {
      prioritizedTasks.push(...state.queuedTargets);
    }
    if (settings.prioritizeTriggers.includes("req")) {
      prioritizedTasks.push(...state.triggerTargets);
    }
    if (settings.missionRequest) {
      for (let i = state.missionBuildingList.length - 1; i >= 0; i--) {
        const mission = state.missionBuildingList[i];
        if (
          mission.isUnlocked() &&
          mission.autoBuildEnabled &&
          (mission !== buildings.BlackholeJumpShip ||
            !settings.prestigeBioseedConstruct ||
            settings.prestigeType !== "whitehole")
        ) {
          prioritizedTasks.push(mission);
        } else if (mission.isComplete()) {
          state.missionBuildingList.splice(i, 1);
        }
      }
    }

    if (
      prioritizedTasks.length === 0 &&
      (getIsEarlyGame()()
        ? settings.researchRequest
        : settings.researchRequestSpace)
    ) {
      prioritizedTasks = state.unlockedTechs.filter((technology) =>
        technology.isAffordable!(true),
      );
    }

    if (prioritizedTasks.length > 0) {
      for (let i = 0; i < prioritizedTasks.length; i++) {
        const demandedObject = prioritizedTasks[i];
        for (const resourceId in demandedObject.cost) {
          const resource = resources[resourceId];
          let quantity = demandedObject.cost[resourceId];
          if (isProject(demandedObject) && demandedObject.progress! < 99) {
            quantity *= 2;
          }
          resource.requestQuantity(quantity);
        }
      }
    }

    const spyManager = getSpyManager();
    if (spyManager.purchaseMoney && settings.prioritizeUnify.includes("req")) {
      resources.Money.requestQuantity(spyManager.purchaseMoney);
    }

    const fleetManagerOuter = getFleetManagerOuter();
    if (
      settings.autoFleet &&
      fleetManagerOuter.nextShipAffordable &&
      settings.prioritizeOuterFleet.includes("req")
    ) {
      for (const resourceId in fleetManagerOuter.nextShipCost) {
        resources[resourceId].requestQuantity(
          fleetManagerOuter.nextShipCost[resourceId],
        );
      }
    }

    const jobManager = getJobManager();
    const availableCrafters =
      jobManager.craftingMax() + jobManager.skilledServantsMax();
    const crafter = getCrafter();
    for (const crafterId in crafter) {
      const resource = crafter[crafterId].resource;
      if (
        (settings.productionFactoryFocusMaterials || resource.isDemanded!()) &&
        resource.isUnlocked!()
      ) {
        for (const resourceId in resource.cost!) {
          const material = resources[resourceId];
          const minExpected =
            material.maxQuantity * resource.craftPreserve! +
            availableCrafters *
              (1 / 140) *
              consumptionBalanceTarget *
              resource.cost![resourceId];
          material.requestQuantity(minExpected);
        }
      }
    }

    const prioritizeCosts = (
      costs: ProductionCost | ProductionCost[],
      multiplier = 1,
      storageThreshold = 0,
    ) => {
      const costList = Array.isArray(costs) ? costs : [costs];
      costList.forEach((cost) => {
        const request =
          cost.quantity * multiplier +
          (cost.minRateOfChange ?? 0) +
          storageThreshold * cost.resource.maxQuantity;
        cost.resource.requestQuantity(request);
      });
    };

    const vitreloyPlant = buildings.Alien1VitreloyPlant;
    const vitPlantCount =
      settings.autoPower && vitreloyPlant.autoStateEnabled
        ? vitreloyPlant.count
        : vitreloyPlant.stateOnCount;
    if (vitPlantCount > 0) {
      resources.Stanene.requestQuantity(
        vitPlantCount * consumptionBalanceTarget * 100,
      );
    }

    const factoryManager = getFactoryManager();
    const factoryCount = factoryManager.maxOperating();
    if (factoryCount > 0) {
      Object.values(factoryManager.Productions).forEach((production) => {
        if (
          (settings.productionFactoryFocusMaterials ||
            production.resource.isDemanded!()) &&
          production.unlocked &&
          production.enabled &&
          production.weighting
        ) {
          prioritizeCosts(
            production.cost,
            factoryCount * consumptionBalanceTarget,
            settings.productionFactoryMinIngredients,
          );
        }
      });
    }
  }

  return { prioritizeDemandedResources };
}
