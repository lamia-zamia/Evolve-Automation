import { createBuildPlanner } from "../planning/build-planner.ts";
import { createGameBuildPlannerEvolveAdapter } from "../adapters/evolve/game-build-planner.ts";

declare global {
  var __EA_TEST_SURFACE_ENABLED__: boolean;
}

interface RuntimeTestSurface {
  add(part: Record<string, unknown>): void;
}

type BuildPlannerDependencies = Parameters<typeof createBuildPlanner>[0];
type GameBuildPlannerDependencies = Parameters<
  typeof createGameBuildPlannerEvolveAdapter
>[0];

interface BuildPlannerControlDependencies
  extends
    Omit<BuildPlannerDependencies, "gameBuildPlanner">,
    GameBuildPlannerDependencies {
  readonly testSurface: RuntimeTestSurface | undefined;
  readonly setTestContext: (context: unknown) => void;
}

export function createBuildPlannerControl({
  getGame,
  getDocument,
  getJQuery,
  getPoly,
  getNiceNumber,
  getSettings,
  getSettingsRaw,
  getState,
  plannerLimitingResource,
  loadPlannerStats,
  savePlannerStats,
  testSurface,
  setTestContext,
}: BuildPlannerControlDependencies) {
  const gameBuildPlanner = createGameBuildPlannerEvolveAdapter({
    getGame,
    getDocument,
    getJQuery,
    getPoly,
    getNiceNumber,
  });
  const planner = createBuildPlanner({
    gameBuildPlanner,
    getSettings,
    getSettingsRaw,
    getState,
    plannerLimitingResource,
    loadPlannerStats,
    savePlannerStats,
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      updateBuildPlanner: () => planner.updateBuildPlanner(),
      setBuildPlannerTestContext: setTestContext,
    });
  return planner;
}
