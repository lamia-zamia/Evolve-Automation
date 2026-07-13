type Cost = Record<string, number>;

type PriorityTarget = {
  title: string;
  cost: Cost;
  isAffordable(max?: boolean): boolean;
  updateResourceRequirements(): void;
};

type ConflictTarget = {
  name: string;
  cause: string;
  cost: Cost;
};

type PriorityTargetsState = {
  conflictTargets: ConflictTarget[];
  queuedTargets: PriorityTarget[];
  queuedTargetsAll: PriorityTarget[];
  triggerTargets: PriorityTarget[];
  unlockedTechs: PriorityTarget[];
  [key: string]: unknown;
};

type PriorityTargetsSettings = {
  prioritizeQueue: string[];
  prioritizeUnify: string[];
  prioritizeTriggers: string[];
  prioritizeOuterFleet: string[];
  autoFleet: boolean;
  autoMech: boolean;
  autoTrigger: boolean;
  mechBuild: string;
  fleetEmbassyKnowledge: number;
  [key: string]: unknown;
};

type QueuedItem = { id: string; [key: string]: unknown };

type PriorityTargetsGame = {
  global: {
    queue: { display: boolean; queue: QueuedItem[] };
    r_queue: { display: boolean; queue: QueuedItem[] };
    settings: Record<string, unknown>;
    portal: { mechbay: MechBay };
    [key: string]: unknown;
  };
};

type MechBay = {
  max: number;
  bay: number;
  blueprint: { size: string };
};

type PriorityTargetsBuilding = PriorityTarget & {
  count: number;
  isAutoBuildable(): boolean;
};

type PriorityTargetsDependencies = {
  getSettings: () => PriorityTargetsSettings;
  getState: () => PriorityTargetsState;
  getGame: () => PriorityTargetsGame;
  getResources: () => Record<string, { maxQuantity: number }>;
  getBuildings: () => Record<string, PriorityTargetsBuilding>;
  getTechIds: () => Record<string, PriorityTarget>;
  getBuildingIds: () => Record<string, PriorityTarget>;
  getArpaIds: () => Record<string, PriorityTarget>;
  getSpyManager: () => { purchaseMoney: number };
  getFleetManagerOuter: () => {
    nextShipAffordable: boolean;
    nextShipName: string;
    nextShipCost: Cost;
  };
  getMechManager: () => {
    initLab(): boolean;
    getPreferredSize(): string[];
    getMechCost(blueprint: { size: string }): [number, number, number];
  };
  getTriggerManager: () => {
    targetTriggers: { actionId: string }[];
    resetTargetTriggers(): void;
  };
  getJQuery: () => (selector: string) => {
    each(callback: (this: { id: string }) => void): unknown;
  };
  getQueuedItemObj: (item: QueuedItem) => PriorityTarget | undefined;
  getTechConflict: (tech: PriorityTarget) => string | false;
  isPrestigeAllowed: (type?: string) => boolean;
  haveTask: (task: string) => boolean;
  inflationChallengeShouldSaveMoney: () => boolean;
  inflationChallengeMoney: number;
};

export function createPriorityTargets({
  getSettings,
  getState,
  getGame,
  getResources,
  getBuildings,
  getTechIds,
  getBuildingIds,
  getArpaIds,
  getSpyManager,
  getFleetManagerOuter,
  getMechManager,
  getTriggerManager,
  getJQuery,
  getQueuedItemObj,
  getTechConflict,
  isPrestigeAllowed,
  haveTask,
  inflationChallengeShouldSaveMoney,
  inflationChallengeMoney,
}: PriorityTargetsDependencies) {
  function updatePriorityTargets() {
    const settings = getSettings();
    const state = getState();
    const game = getGame();
    const resources = getResources();
    const buildings = getBuildings();
    const techIds = getTechIds();

    state.conflictTargets = [];
    state.queuedTargets = [];
    state.queuedTargetsAll = [];
    state.triggerTargets = [];
    state.unlockedTechs = [];
    state.unlockedBuildings = [];

    // Building and research queues
    const queueSave = settings.prioritizeQueue.includes("save");
    (
      [
        { type: "queue", noorder: "qAny", map: getQueuedItemObj },
        {
          type: "r_queue",
          noorder: "qAny_res",
          map: (item: QueuedItem) => techIds[item.id],
        },
      ] as const
    ).forEach((queue) => {
      const queueState = game.global[queue.type] as {
        display: boolean;
        queue: QueuedItem[];
      };
      if (queueState.display) {
        for (const item of queueState.queue) {
          const obj = queue.map(item);
          if (obj) {
            state.queuedTargetsAll.push(obj);
            if (obj.isAffordable(true)) {
              state.queuedTargets.push(obj);
              if (queueSave) {
                state.conflictTargets.push({
                  name: obj.title,
                  cause: "Queue",
                  cost: obj.cost,
                });
              }
            }
          }
          if (!game.global.settings[queue.noorder]) {
            break;
          }
        }
      }
    });

    const SpyManager = getSpyManager();
    if (SpyManager.purchaseMoney && settings.prioritizeUnify.includes("save")) {
      state.conflictTargets.push({
        name: techIds["tech-unification"].title,
        cause: "Purchase",
        cost: { Money: SpyManager.purchaseMoney },
      });
    }

    if (inflationChallengeShouldSaveMoney()) {
      state.conflictTargets.push({
        name: "Inflation challenge",
        cause: "Wheelbarrow",
        cost: { Money: inflationChallengeMoney },
      });
    }

    const FleetManagerOuter = getFleetManagerOuter();
    if (
      settings.autoFleet &&
      FleetManagerOuter.nextShipAffordable &&
      settings.prioritizeOuterFleet.includes("save")
    ) {
      state.conflictTargets.push({
        name: FleetManagerOuter.nextShipName,
        cause: "Ship",
        cost: FleetManagerOuter.nextShipCost,
      });
    }

    // Reserve gems for mechs
    const MechManager = getMechManager();
    if (
      settings.autoMech &&
      MechManager.initLab() &&
      buildings.AsphodelEncampment.count === 0
    ) {
      const mechBay = game.global.portal.mechbay;
      const baySpace = mechBay.max - mechBay.bay;

      // only reserve gems if we have bay space
      if (baySpace > 0) {
        const newSize = !haveTask("mech")
          ? settings.mechBuild === "random"
            ? MechManager.getPreferredSize()[0]
            : mechBay.blueprint.size
          : "titan";
        const [newGems] = MechManager.getMechCost({ size: newSize });

        if (newGems > 0) {
          state.conflictTargets.push({
            name: `Next mech (${newSize})`,
            cause: "Mech",
            cost: { Soul_Gem: newGems },
          });
        }
      }
    }

    if (settings.autoTrigger) {
      const TriggerManager = getTriggerManager();
      const buildingIds = getBuildingIds();
      const arpaIds = getArpaIds();
      TriggerManager.resetTargetTriggers();
      const triggerSave = settings.prioritizeTriggers.includes("save");

      // Active triggers
      for (const trigger of TriggerManager.targetTriggers) {
        const id = trigger.actionId;
        const obj = arpaIds[id] || buildingIds[id] || techIds[id];
        if (obj) {
          state.triggerTargets.push(obj);
          if (triggerSave) {
            state.conflictTargets.push({
              name: obj.title,
              cause: "Trigger",
              cost: obj.cost,
            });
          }
        }
      }

      // Fake trigger for Embassy
      if (
        buildings.GorddonEmbassy.isAutoBuildable() &&
        resources.Knowledge.maxQuantity >= settings.fleetEmbassyKnowledge
      ) {
        const obj = buildings.GorddonEmbassy;
        state.triggerTargets.push(obj);
        state.conflictTargets.push({
          name: obj.title,
          cause: "Knowledge",
          cost: obj.cost,
        });
      }
      // Fake trigger for Eden
      if (
        buildings.TauStarEden.isAutoBuildable() &&
        isPrestigeAllowed("eden")
      ) {
        const obj = buildings.TauStarEden;
        state.triggerTargets.push(obj);
        state.conflictTargets.push({
          name: obj.title,
          cause: "Prestige",
          cost: obj.cost,
        });
      }
      // Fake trigger for Ignition
      if (
        buildings.TauGas2MatrioshkaBrain.count >= 1000 &&
        buildings.TauGas2IgniteGasGiant.isAutoBuildable() &&
        isPrestigeAllowed("retire")
      ) {
        const obj = buildings.TauGas2IgniteGasGiant;
        state.triggerTargets.push(obj);
        state.conflictTargets.push({
          name: obj.title,
          cause: "Prestige",
          cost: obj.cost,
        });
      }
    }

    getJQuery()("#tech .action").each(function (this: { id: string }) {
      const tech = techIds[this.id];
      tech.updateResourceRequirements();
      if (
        !getTechConflict(tech) ||
        state.triggerTargets.includes(tech) ||
        state.queuedTargetsAll.includes(tech)
      ) {
        state.unlockedTechs.push(tech);
      }
    });
  }

  return { updatePriorityTargets };
}
