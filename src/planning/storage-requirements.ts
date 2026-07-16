import { calculateKnowledgeRequirements } from "../domain/knowledge-requirements.ts";

type StorageResource = {
  maxQuantity: number;
  maxCost: number;
  storageRequired: number;
  autoSellEnabled: boolean;
  autoSellRatio: number;
  hasStorage: () => boolean;
};

type StorageTarget = {
  cost: Record<string, number>;
  weighting?: number;
  is?: { knowledge?: unknown };
  isAutoBuildable?: () => boolean;
  isUnlocked?: () => boolean;
  autoBuildEnabled?: boolean;
};

type StorageRequirementDependencies = {
  getSettings: () => {
    storageAssignExtra: boolean;
    fleetEmbassyKnowledge: number;
    autoFleet: boolean;
    prioritizeOuterFleet: string;
    autoMarket: boolean;
  };
  getState: () => {
    unlockedTechs: StorageTarget[];
    queuedTargetsAll: StorageTarget[];
    triggerTargets: StorageTarget[];
    knowledgeRequiredByTechs: number;
    cheapestTechKnowledge: number;
    knowledgeRequiredByBuildTargets: number;
  };
  getResources: () => Record<string, StorageResource> & {
    Money: StorageResource;
    Graphene: StorageResource;
  };
  getBuildings: () => {
    GorddonEmbassy: { isAutoBuildable: () => boolean };
  };
  getGame: () => { global: { race: Record<string, unknown> } };
  getBuildingManager: () => { priorityList: StorageTarget[] };
  getProjectManager: () => { priorityList: StorageTarget[] };
  getFleetManagerOuter: () => {
    nextShipExpandable: boolean;
    nextShipCost: Record<string, number>;
  };
  isTechnology: (target: StorageTarget) => boolean;
  getInflationChallengeAssistActive: () => () => boolean;
  getRetirementChallengeAssistActive: () => () => boolean;
  getInflationChallengeMoney: () => number;
  getRetirementGraphene: () => number;
};

export function createStorageRequirements({
  getSettings,
  getState,
  getResources,
  getBuildings,
  getGame,
  getBuildingManager,
  getProjectManager,
  getFleetManagerOuter,
  isTechnology,
  getInflationChallengeAssistActive,
  getRetirementChallengeAssistActive,
  getInflationChallengeMoney,
  getRetirementGraphene,
}: StorageRequirementDependencies) {
  function requestStorageFor(list: StorageTarget[]) {
    const settings = getSettings();
    const resources = getResources();
    // Required amount increased by 3% from actual numbers, as other logic of script can and will try to prevent overflowing by selling\ejecting\building projects, and that might cause an issues if we'd need 100% of storage
    const bufferMult = settings.storageAssignExtra ? 1.03 : 1;
    listLoop: for (let i = 0; i < list.length; i++) {
      const object = list[i];
      let storageSuffient = true;
      for (const resourceId in object.cost) {
        resources[resourceId].maxCost = Math.max(
          object.cost[resourceId],
          resources[resourceId].maxCost,
        );
        if (
          resources[resourceId].maxQuantity < object.cost[resourceId] &&
          !resources[resourceId].hasStorage()
        ) {
          storageSuffient = false;
        }
      }
      if (!storageSuffient) {
        continue listLoop;
      }
      for (const resourceId in object.cost) {
        let assumeCost = object.cost[resourceId] * bufferMult;
        if (
          resources[resourceId].maxQuantity < assumeCost &&
          !resources[resourceId].hasStorage()
        ) {
          assumeCost =
            (object.cost[resourceId] + resources[resourceId].maxQuantity) / 2;
        }
        resources[resourceId].storageRequired = Math.max(
          assumeCost,
          resources[resourceId].storageRequired,
        );
      }
    }
  }

  function calculateRequiredStorages() {
    const settings = getSettings();
    const state = getState();
    const resources = getResources();
    const buildings = getBuildings();
    const buildingManager = getBuildingManager();
    const projectManager = getProjectManager();
    const fleetManagerOuter = getFleetManagerOuter();

    const knowledge = calculateKnowledgeRequirements({
      techKnowledgeCosts: [
        ...state.unlockedTechs.map((tech) => tech.cost["Knowledge"] ?? 0),
        ...(buildings.GorddonEmbassy.isAutoBuildable()
          ? [settings.fleetEmbassyKnowledge]
          : []),
      ],
      reservedTargets: [...state.queuedTargetsAll, ...state.triggerTargets].map(
        (target) => ({
          knowledgeCost: target.cost?.Knowledge ?? 0,
          isTechnology: isTechnology(target),
          isKnowledge: Boolean(target.is?.knowledge),
        }),
      ),
      buildCandidates: [
        ...buildingManager.priorityList,
        ...projectManager.priorityList,
      ].map((object) => ({
        knowledgeCost: object.cost?.Knowledge ?? 0,
        isKnowledge: Boolean(object.is?.knowledge),
        weighting: object.weighting ?? 0,
        autoBuildable: Boolean(object.isAutoBuildable?.()),
      })),
    });
    state.knowledgeRequiredByTechs = knowledge.knowledgeRequiredByTechs;
    state.cheapestTechKnowledge = knowledge.cheapestTechKnowledge;
    state.knowledgeRequiredByBuildTargets =
      knowledge.knowledgeRequiredByBuildTargets;

    if (
      settings.autoFleet &&
      fleetManagerOuter.nextShipExpandable &&
      settings.prioritizeOuterFleet !== "ignore"
    ) {
      requestStorageFor([{ cost: fleetManagerOuter.nextShipCost }]);
    }
    requestStorageFor(state.unlockedTechs);
    requestStorageFor(state.queuedTargetsAll);
    requestStorageFor(
      buildingManager.priorityList.filter(
        (building) => building.isUnlocked?.() && building.autoBuildEnabled,
      ),
    );
    requestStorageFor(
      projectManager.priorityList.filter(
        (project) => project.isUnlocked?.() && project.autoBuildEnabled,
      ),
    );
    if (getInflationChallengeAssistActive()()) {
      const inflationChallengeMoney = getInflationChallengeMoney();
      resources.Money.maxCost = Math.max(
        resources.Money.maxCost,
        inflationChallengeMoney,
      );
      resources.Money.storageRequired = Math.max(
        resources.Money.storageRequired,
        inflationChallengeMoney,
      );
    }
    if (getRetirementChallengeAssistActive()()) {
      const retirementGraphene = getRetirementGraphene();
      resources.Graphene.maxCost = Math.max(
        resources.Graphene.maxCost,
        retirementGraphene,
      );
      resources.Graphene.storageRequired = Math.max(
        resources.Graphene.storageRequired,
        retirementGraphene,
      );
    }

    if (
      settings.storageAssignExtra &&
      !getGame().global.race["no_trade"] &&
      settings.autoMarket
    ) {
      for (const resourceId in resources) {
        if (
          resources[resourceId].autoSellEnabled &&
          resources[resourceId].autoSellRatio > 0
        ) {
          resources[resourceId].storageRequired /=
            resources[resourceId].autoSellRatio;
        }
      }
    }
  }

  return { requestStorageFor, calculateRequiredStorages };
}
