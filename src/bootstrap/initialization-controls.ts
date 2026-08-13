import { createStateInitialization } from "../game/state-initialization.ts";
import { createRaceInitialization } from "../game/race-initialization.ts";
import { createBuildingStateInitialization } from "../game/building-state.ts";

declare global {
  var __EA_TEST_SURFACE_ENABLED__: boolean;
}

interface RuntimeTestSurface {
  add(part: Record<string, unknown>): void;
}

type StateDependencies = Parameters<typeof createStateInitialization>[0];
type RaceDependencies = Parameters<typeof createRaceInitialization>[0];
type BuildingDependencies = Parameters<
  typeof createBuildingStateInitialization
>[0];

export function createStateInitializationControl({
  testSurface,
  getTestContextSnapshot,
  setTestContext,
  ...dependencies
}: StateDependencies & {
  readonly testSurface: RuntimeTestSurface | undefined;
  readonly getTestContext: () => unknown;
  readonly getTestContextSnapshot: () => unknown;
  readonly setTestContext: (context: unknown) => void;
}) {
  const initialization = createStateInitialization(dependencies);
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      initialiseState: initialization.initialiseState,
      getStateInitializationTestContext: getTestContextSnapshot,
      setStateInitializationTestContext: (context: unknown) => {
        setTestContext(context);
      },
    });
  return initialization;
}

export function createRaceInitializationControl({
  testSurface,
  setTestContext,
  ...dependencies
}: RaceDependencies & {
  readonly testSurface: RuntimeTestSurface | undefined;
  readonly setTestContext: (context: unknown) => void;
}) {
  const initialization = createRaceInitialization(dependencies);
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      initialiseRaces: initialization.initialiseRaces,
      setRaceInitializationTestContext: setTestContext,
    });
  return initialization;
}

export function createBuildingStateInitializationControl({
  testSurface,
  setTestContext,
  ...dependencies
}: BuildingDependencies & {
  readonly testSurface: RuntimeTestSurface | undefined;
  readonly setTestContext: (context: unknown) => void;
}) {
  const initialization = createBuildingStateInitialization(dependencies);
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      initBuildingState: initialization.initBuildingState,
      setBuildingStateTestContext: setTestContext,
    });
  return initialization;
}
