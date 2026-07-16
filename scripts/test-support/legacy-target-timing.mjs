export function legacyGetMultiSegmentedTimeLeft({
  game,
  target,
  isProject,
  timeFormat,
}) {
  let remainingSegments = target.gameMax - target.count;
  if (isProject) {
    remainingSegments = (100 - target.progress) / target.currentStep;
  }

  let longestResource = "";
  let longestTimeLeft = 0;
  Object.keys(target.cost).forEach((resource) => {
    const resourceCostTotal = target.cost[resource] * remainingSegments;
    const resourceTimeLeftRaw =
      (resourceCostTotal - game.global.resource[resource].amount) /
      game.global.resource[resource].diff;

    if (
      resourceTimeLeftRaw > longestTimeLeft &&
      resourceCostTotal > game.global.resource[resource].amount
    ) {
      longestResource = resource;
      longestTimeLeft = resourceTimeLeftRaw;
    }
  });

  return {
    resource: longestResource,
    timeLeft:
      longestTimeLeft === Infinity ? "Never" : timeFormat(longestTimeLeft),
  };
}
