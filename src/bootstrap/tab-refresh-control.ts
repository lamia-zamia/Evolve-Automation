import { createTabRefresh } from "../ui/tab-refresh.ts";

declare global {
  var __EA_TEST_SURFACE_ENABLED__: boolean;
}

interface RuntimeTestSurface {
  add(part: Record<string, unknown>): void;
}

type TabRefreshDependencies = Parameters<typeof createTabRefresh>[0];

interface TabRefreshControlDependencies extends TabRefreshDependencies {
  readonly testSurface: RuntimeTestSurface | undefined;
  readonly setTestContext: (context: unknown) => void;
}

export function createTabRefreshControl({
  getState,
  getGame,
  getBuildings,
  getResources,
  getHaveTech,
  isPageVisible,
  getMainVue,
  testSurface,
  setTestContext,
}: TabRefreshControlDependencies) {
  const tabs = createTabRefresh({
    getState,
    getGame,
    getBuildings,
    getResources,
    getHaveTech,
    isPageVisible,
    getMainVue,
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      updateTabs: (update: boolean) => tabs.updateTabs(update),
      setTabRefreshTestContext: setTestContext,
    });
  return tabs;
}
