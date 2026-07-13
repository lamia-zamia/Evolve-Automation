type Cost = Record<string, number>;

type ConflictTarget = {
  name: string;
  cost: Cost;
};

type ConflictResource = {
  name: string;
  currentQuantity: number;
};

type CostConflict = {
  res: ConflictResource;
  obj: ConflictTarget;
  resList: string[];
  actionList: string[];
};

type CostConflictDependencies = {
  getState: () => { conflictTargets: ConflictTarget[] };
  getResources: () => Record<string, ConflictResource>;
  isEmptyObject: (object: Record<string, unknown>) => boolean;
};

export function createCostConflicts({
  getState,
  getResources,
  isEmptyObject,
}: CostConflictDependencies) {
  function getCostConflict(action: { cost: Cost }) {
    const resources = getResources();
    let conflict: Partial<CostConflict> = {};

    for (const priorityTarget of getState().conflictTargets) {
      let blockKnowledge = true;
      for (const resourceId in priorityTarget.cost) {
        if (
          resourceId !== "Knowledge" &&
          resources[resourceId].currentQuantity <
            priorityTarget.cost[resourceId]
        ) {
          blockKnowledge = false;
          break;
        }
      }
      for (const resourceId in priorityTarget.cost) {
        if (
          (resourceId !== "Knowledge" || blockKnowledge) &&
          priorityTarget.cost[resourceId] >
            resources[resourceId].currentQuantity - action.cost[resourceId]
        ) {
          const resourceList = conflict.resList || [];
          const actionList = conflict.actionList || [];
          conflict = {
            res: resources[resourceId],
            obj: priorityTarget,
            resList: [
              ...new Set([...resourceList, resources[resourceId].name]),
            ],
            actionList: [...new Set([...actionList, priorityTarget.name])],
          };
        }
      }
    }
    return isEmptyObject(conflict as Record<string, unknown>)
      ? null
      : (conflict as CostConflict);
  }

  return { getCostConflict };
}
