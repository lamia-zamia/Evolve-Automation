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
  queueDataUnavailable: boolean;
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

type QueuedTargetReadResult =
  | {
      status: "ready";
      target: PriorityTarget;
      maximumAffordable: boolean;
    }
  | { status: "missing"; itemId: string }
  | {
      status: "unavailable";
      reason: string;
      itemId?: string;
      resourceId?: string;
    };

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
  readQueuedTarget: (item: QueuedItem) => QueuedTargetReadResult;
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
  readQueuedTarget,
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
    state.queueDataUnavailable = false;
    state.queuedTargets = [];
    state.queuedTargetsAll = [];
    state.triggerTargets = [];
    state.unlockedTechs = [];
    state.unlockedBuildings = [];
    const queuedTargetsAll = new Set<PriorityTarget>();
    const triggerTargets = new Set<PriorityTarget>();

    // Building and research queues
    const queueSave = settings.prioritizeQueue.includes("save");
    (
      [
        { type: "queue", noorder: "qAny" },
        { type: "r_queue", noorder: "qAny_res" },
      ] as const
    ).forEach((queue) => {
      const queueState = game.global[queue.type] as {
        display: boolean;
        queue: QueuedItem[];
      };
      if (queueState.display) {
        for (const item of queueState.queue) {
          let obj: PriorityTarget | undefined;
          let maximumAffordable = false;
          if (queue.type === "queue") {
            const result = readQueuedTarget(item);
            if (result.status === "ready") {
              obj = result.target;
              maximumAffordable = result.maximumAffordable;
            } else if (
              result.status === "unavailable" &&
              !state.queueDataUnavailable
            ) {
              state.queueDataUnavailable = true;
              // A malformed visible queue must not let unrelated build/research
              // spending proceed as though no reservation existed. The missing
              // resource deliberately drives cost-conflict mapping unavailable.
              state.conflictTargets.push({
                name: "Queue data unavailable",
                cause: "Queue",
                cost: { __EA_QUEUE_DATA_UNAVAILABLE__: 1 },
              });
            }
          } else {
            obj = techIds[item.id];
            maximumAffordable = obj?.isAffordable(true) ?? false;
          }
          if (obj) {
            state.queuedTargetsAll.push(obj);
            queuedTargetsAll.add(obj);
            if (maximumAffordable) {
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
    const unification = techIds["tech-unification"];
    if (
      SpyManager.purchaseMoney &&
      settings.prioritizeUnify.includes("save") &&
      unification !== undefined
    ) {
      state.conflictTargets.push({
        name: unification.title,
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
      (buildings.AsphodelEncampment?.count ?? 0) === 0
    ) {
      const mechBay = game.global.portal.mechbay;
      const baySpace = mechBay.max - mechBay.bay;

      // only reserve gems if we have bay space
      if (baySpace > 0) {
        const newSize = haveTask("mech")
          ? "titan"
          : settings.mechBuild === "random"
            ? (MechManager.getPreferredSize()[0] ?? mechBay.blueprint.size)
            : mechBay.blueprint.size;
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
          triggerTargets.add(obj);
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
      const embassy = buildings.GorddonEmbassy;
      const knowledge = resources.Knowledge;
      if (
        embassy !== undefined &&
        knowledge !== undefined &&
        embassy.isAutoBuildable() &&
        knowledge.maxQuantity >= settings.fleetEmbassyKnowledge
      ) {
        state.triggerTargets.push(embassy);
        triggerTargets.add(embassy);
        state.conflictTargets.push({
          name: embassy.title,
          cause: "Knowledge",
          cost: embassy.cost,
        });
      }
      // Fake trigger for Eden
      const eden = buildings.TauStarEden;
      if (
        eden !== undefined &&
        eden.isAutoBuildable() &&
        isPrestigeAllowed("eden")
      ) {
        state.triggerTargets.push(eden);
        triggerTargets.add(eden);
        state.conflictTargets.push({
          name: eden.title,
          cause: "Prestige",
          cost: eden.cost,
        });
      }
      // Fake trigger for Ignition
      const ignition = buildings.TauGas2IgniteGasGiant;
      if (
        ignition !== undefined &&
        (buildings.TauGas2MatrioshkaBrain?.count ?? 0) >= 1000 &&
        ignition.isAutoBuildable() &&
        isPrestigeAllowed("retire")
      ) {
        state.triggerTargets.push(ignition);
        triggerTargets.add(ignition);
        state.conflictTargets.push({
          name: ignition.title,
          cause: "Prestige",
          cost: ignition.cost,
        });
      }
    }

    getJQuery()("#tech .action").each(function (this: { id: string }) {
      const tech = techIds[this.id];
      if (tech === undefined) {
        return;
      }
      tech.updateResourceRequirements();
      if (
        !getTechConflict(tech) ||
        triggerTargets.has(tech) ||
        queuedTargetsAll.has(tech)
      ) {
        state.unlockedTechs.push(tech);
      }
    });
  }

  return { updatePriorityTargets };
}
