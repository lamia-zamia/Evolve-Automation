import { createStateLogLifecycle } from "../observability/state-log.ts";

declare global {
  var __EA_TEST_SURFACE_ENABLED__: boolean;
}

interface RuntimeTestSurface {
  add(part: Record<string, unknown>): void;
}

type StateLogDependencies = Parameters<typeof createStateLogLifecycle>[0];

interface StateLogControlDependencies extends Omit<
  StateLogDependencies,
  "stateLogStore"
> {
  readonly stateLogStore: StateLogDependencies["stateLogStore"];
  readonly testSurface: RuntimeTestSurface | undefined;
  readonly setTestContext: (context: unknown) => void;
}

export function createStateLogControl({
  getGame,
  getResources,
  getState,
  plannerLimitingResource,
  stateLogStore,
  testSurface,
  setTestContext,
}: StateLogControlDependencies) {
  const lifecycle = createStateLogLifecycle({
    getGame,
    getResources,
    getState,
    plannerLimitingResource,
    stateLogStore,
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      stateLogLifecycle: lifecycle,
      setStateLogTestContext: setTestContext,
    });
  return lifecycle;
}
