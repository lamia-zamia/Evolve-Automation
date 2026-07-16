export function legacyPlannerLimit(input) {
  if (input.affordable) return null;

  let worst = null;
  for (const requirement of input.requirements) {
    if (
      !requirement.unlocked ||
      requirement.currentQuantity >= requirement.requiredQuantity
    ) {
      continue;
    }

    let time;
    let blocker;
    if (requirement.maximumQuantity < requirement.requiredQuantity) {
      time = Number.MAX_SAFE_INTEGER;
      blocker = "storage";
    } else if (requirement.income > 0) {
      time =
        (requirement.requiredQuantity - requirement.currentQuantity) /
        requirement.income;
      blocker = "income";
    } else {
      time = Number.MAX_SAFE_INTEGER / 2;
      blocker = "stalled";
    }

    if (!worst || time > worst.time) {
      worst = {
        resourceId: requirement.resourceId,
        resourceTitle: requirement.resourceTitle,
        time,
        blocker,
      };
    }
  }
  return worst;
}
