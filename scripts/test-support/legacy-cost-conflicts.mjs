export function legacyGetCostConflict(state, resources, action) {
  let conflict = {};

  for (const priorityTarget of state.conflictTargets) {
    let blockKnowledge = true;
    for (const resourceId in priorityTarget.cost) {
      if (
        resourceId !== "Knowledge" &&
        resources[resourceId].currentQuantity < priorityTarget.cost[resourceId]
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
          resList: [...new Set([...resourceList, resources[resourceId].name])],
          actionList: [...new Set([...actionList, priorityTarget.name])],
        };
      }
    }
  }
  return Object.keys(conflict).length === 0 ? null : conflict;
}
