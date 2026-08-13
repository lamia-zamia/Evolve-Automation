import { createLogFilter } from "../observability/log-filter.ts";

declare global {
  var __EA_TEST_SURFACE_ENABLED__: boolean;
}

interface RuntimeTestSurface {
  add(part: Record<string, unknown>): void;
}

type Dependencies = Parameters<typeof createLogFilter>[0];

interface LogFilterControlDependencies extends Dependencies {
  readonly testSurface: RuntimeTestSurface | undefined;
  readonly setTestContext: (context: unknown) => void;
}

export function createLogFilterControl({
  testSurface,
  setTestContext,
  ...dependencies
}: LogFilterControlDependencies) {
  const filter = createLogFilter(dependencies);
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      logFilter: filter,
      setLogFilterTestContext: setTestContext,
    });
  return filter;
}
