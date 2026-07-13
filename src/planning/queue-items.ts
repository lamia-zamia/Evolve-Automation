interface ResourceAmount {
  currentQuantity: number;
  maxQuantity: number;
}

interface QueuedItem {
  action: string;
  id: string;
  label: string;
  type: string;
}

interface QueueTarget {
  id: string;
  name: string;
  title: string;
  cost: Record<string, number>;
  isAffordable(max?: boolean): boolean;
}

interface QueueItemDependencies {
  getResources: () => Record<string, ResourceAmount | undefined>;
  getPoly: () => { shipCosts(type: string): Record<string, number> };
  getMechManager: () => { getMechCost(type: string): [number, number] };
  getBuildingIds: () => Record<string, unknown>;
  getArpaIds: () => Record<string, unknown>;
}

export function createQueueItems({
  getResources,
  getPoly,
  getMechManager,
  getBuildingIds,
  getArpaIds,
}: QueueItemDependencies) {
  function checkAffordableCustom(cost: Record<string, number>, max = false) {
    const resources = getResources();
    const check = max ? "maxQuantity" : "currentQuantity";
    for (const resourceId in cost) {
      if (
        !resources[resourceId] ||
        resources[resourceId][check] < cost[resourceId]
      ) {
        return false;
      }
    }
    return true;
  }

  function makeTarget(
    queueItem: QueuedItem,
    cost: Record<string, number>,
  ): QueueTarget {
    return {
      id: queueItem.id,
      name: queueItem.label,
      title: queueItem.label,
      cost,
      isAffordable(max) {
        return checkAffordableCustom(this.cost, max);
      },
    };
  }

  function getQueuedItemObj(queueItem: QueuedItem) {
    if (queueItem.action === "tp-ship") {
      return makeTarget(queueItem, getPoly().shipCosts(queueItem.type));
    } else if (queueItem.action === "hell-mech") {
      const [gems, supply] = getMechManager().getMechCost(queueItem.type);
      return makeTarget(queueItem, { Soul_Gem: gems, Supply: supply });
    } else {
      return getBuildingIds()[queueItem.id] || getArpaIds()[queueItem.id];
    }
  }

  return { checkAffordableCustom, getQueuedItemObj };
}
