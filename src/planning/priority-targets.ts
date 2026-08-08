import type { GamePriorityTargetsPort } from "../ports/game-priority-targets.ts";

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

type PriorityTargetsBuilding = PriorityTarget & {
  count: number;
  isAutoBuildable(): boolean;
};

type PriorityTargetsDependencies = {
  gamePriorityTargets: GamePriorityTargetsPort;
  getSettings: () => PriorityTargetsSettings;
  getState: () => PriorityTargetsState;
  getResources: () => Record<string, { maxQuantity: number }>;
  getBuildings: () => Record<string, PriorityTargetsBuilding>;
  getTechIds: () => Record<string, PriorityTarget>;
  getBuildingIds: () => Record<string, PriorityTarget>;
  getArpaIds: () => Record<string, PriorityTarget>;
  readQueuedTarget: (item: QueuedItem) => QueuedTargetReadResult;
  getTechConflict: (tech: PriorityTarget) => string | false;
  isPrestigeAllowed: (type?: string) => boolean;
  haveTask: (task: string) => boolean;
  inflationChallengeShouldSaveMoney: () => boolean;
  inflationChallengeMoney: number;
};

export function createPriorityTargets({
  gamePriorityTargets,
  getSettings,
  getState,
  getResources,
  getBuildings,
  getTechIds,
  getBuildingIds,
  getArpaIds,
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
    (["queue", "r_queue"] as const).forEach((kind) => {
      const queueState = gamePriorityTargets.readQueue(kind);
      if (queueState.display) {
        for (const item of queueState.items) {
          const queuedItem = item as QueuedItem;
          let obj: PriorityTarget | undefined;
          let maximumAffordable = false;
          if (kind === "queue") {
            const result = readQueuedTarget(queuedItem);
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
            obj = techIds[queuedItem.id];
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
          if (!queueState.noorder) {
            break;
          }
        }
      }
    });

    const spyPurchaseMoney = gamePriorityTargets.readSpyPurchaseMoney();
    const unification = techIds["tech-unification"];
    if (
      spyPurchaseMoney &&
      settings.prioritizeUnify.includes("save") &&
      unification !== undefined
    ) {
      state.conflictTargets.push({
        name: unification.title,
        cause: "Purchase",
        cost: { Money: spyPurchaseMoney },
      });
    }

    if (inflationChallengeShouldSaveMoney()) {
      state.conflictTargets.push({
        name: "Inflation challenge",
        cause: "Wheelbarrow",
        cost: { Money: inflationChallengeMoney },
      });
    }

    const nextShip = gamePriorityTargets.readOuterFleetNextShip();
    if (
      settings.autoFleet &&
      nextShip.affordable &&
      settings.prioritizeOuterFleet.includes("save")
    ) {
      state.conflictTargets.push({
        name: nextShip.name,
        cause: "Ship",
        cost: { ...nextShip.cost },
      });
    }

    // Reserve gems for mechs
    if (
      settings.autoMech &&
      gamePriorityTargets.readMechLabReady() &&
      (buildings.AsphodelEncampment?.count ?? 0) === 0
    ) {
      const mechBay = gamePriorityTargets.readMechBay();
      const baySpace = mechBay.max - mechBay.bay;

      // only reserve gems if we have bay space
      if (baySpace > 0) {
        const newSize = haveTask("mech")
          ? "titan"
          : settings.mechBuild === "random"
            ? (gamePriorityTargets.readMechPreferredSize() ??
              mechBay.blueprintSize)
            : mechBay.blueprintSize;
        const newGems = gamePriorityTargets.readMechCost(newSize);

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
      const buildingIds = getBuildingIds();
      const arpaIds = getArpaIds();
      gamePriorityTargets.resetTargetTriggers();
      const triggerSave = settings.prioritizeTriggers.includes("save");

      // Active triggers
      for (const trigger of gamePriorityTargets.readTriggerTargets()) {
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

    for (const id of gamePriorityTargets.readTechActionIds()) {
      const tech = techIds[id];
      if (tech === undefined) {
        continue;
      }
      tech.updateResourceRequirements();
      if (
        !getTechConflict(tech) ||
        triggerTargets.has(tech) ||
        queuedTargetsAll.has(tech)
      ) {
        state.unlockedTechs.push(tech);
      }
    }
  }

  return { updatePriorityTargets };
}
