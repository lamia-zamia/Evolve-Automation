interface TimedTarget {
  gameMax: number;
  count: number;
  progress?: number;
  currentStep?: number;
  cost: Record<string, number>;
}

interface TargetTimingDependencies {
  getGame: () => {
    global: {
      resource: Record<string, { amount: number; diff: number }>;
    };
  };
  getPoly: () => { timeFormat(seconds: number): string };
  isProject: (target: TimedTarget) => boolean;
}

export function createTargetTiming({
  getGame,
  getPoly,
  isProject,
}: TargetTimingDependencies) {
  function getMultiSegmentedTimeLeft(target: TimedTarget) {
    let remainingSegments = target.gameMax - target.count;
    if (isProject(target)) {
      remainingSegments = (100 - target.progress!) / target.currentStep!;
    }

    let longestResource = "";
    let longestTimeLeft = 0;
    const game = getGame();
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
        longestTimeLeft === Infinity
          ? "Never"
          : getPoly().timeFormat(longestTimeLeft),
    };
  }

  return { getMultiSegmentedTimeLeft };
}
