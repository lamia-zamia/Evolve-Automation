import { createPriorityTargets } from "../planning/priority-targets.ts";
import { createGamePriorityTargetsEvolveAdapter } from "../adapters/evolve/game-priority-targets.ts";

declare global {
  var __EA_TEST_SURFACE_ENABLED__: boolean;
}

interface RuntimeTestSurface {
  add(part: Record<string, unknown>): void;
}

type PriorityTargetDependencies = Parameters<typeof createPriorityTargets>[0];
type GamePriorityTargetsDependencies = Parameters<
  typeof createGamePriorityTargetsEvolveAdapter
>[0];

interface PriorityTargetsControlDependencies
  extends
    Omit<PriorityTargetDependencies, "gamePriorityTargets">,
    GamePriorityTargetsDependencies {
  readonly testSurface: RuntimeTestSurface | undefined;
  readonly setTestContext: (context: unknown) => void;
}

export function createPriorityTargetsControl({
  getGame,
  getSpyManager,
  getFleetManagerOuter,
  getMechManager,
  getTriggerManager,
  getJQuery,
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
  testSurface,
  setTestContext,
}: PriorityTargetsControlDependencies) {
  const gamePriorityTargets = createGamePriorityTargetsEvolveAdapter({
    getGame,
    getSpyManager,
    getFleetManagerOuter,
    getMechManager,
    getTriggerManager,
    getJQuery,
  });
  const priorityTargets = createPriorityTargets({
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
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      updatePriorityTargets: () => priorityTargets.updatePriorityTargets(),
      setPriorityTargetsTestContext: setTestContext,
    });
  return priorityTargets;
}
