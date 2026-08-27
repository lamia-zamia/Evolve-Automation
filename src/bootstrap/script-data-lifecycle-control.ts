import { createScriptDataLifecycle } from "../game/script-data.ts";

declare global {
  var __EA_TEST_SURFACE_ENABLED__: boolean;
}

interface RuntimeTestSurface {
  add(part: Record<string, unknown>): void;
  getContext(name: string): unknown;
  setContext(name: string, context: unknown): void;
}

type LifecycleDependencies = Parameters<typeof createScriptDataLifecycle>[0];

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function readContextValue<T>(
  context: unknown,
  property: string,
  fallback: T,
): T {
  const value = readRecord(context)?.[property];
  return value === undefined ? fallback : (value as T);
}

function readContextAction<T extends (...args: never[]) => unknown>(
  context: unknown,
  property: string,
  fallback: T,
): T {
  const actions = readRecord(readRecord(context)?.["actions"]);
  const value = actions?.[property];
  return typeof value === "function" ? (value as T) : fallback;
}

function getTestContextReader(testSurface: RuntimeTestSurface | undefined) {
  if (!globalThis.__EA_TEST_SURFACE_ENABLED__) return () => undefined;
  return (name: string): unknown => testSurface?.getContext(name);
}

interface ScriptDataLifecycleControlDependencies extends Omit<
  LifecycleDependencies,
  | "getUpdateCraftCost"
  | "getResourcesPerClick"
  | "getTicksPerSecond"
  | "getHaveTech"
> {
  readonly getUpdateCraftCost: LifecycleDependencies["getUpdateCraftCost"];
  readonly getResourcesPerClick: LifecycleDependencies["getResourcesPerClick"];
  readonly getTicksPerSecond: LifecycleDependencies["getTicksPerSecond"];
  readonly getHaveTech: LifecycleDependencies["getHaveTech"];
  readonly testSurface: RuntimeTestSurface | undefined;
  readonly diagnostics: LifecycleDependencies["diagnostics"];
}

export function createScriptDataLifecycleControl({
  getSettings,
  getState,
  getGame,
  getResources,
  getBuildings,
  getWarManager,
  getMarketManager,
  getBuildingManager,
  getSpyManager,
  getEjectManager,
  getSupplyManager,
  getNaniteManager,
  getRitualManager,
  getUpdateCraftCost,
  getResourcesPerClick,
  getTicksPerSecond,
  getHaveTech,
  testSurface,
  diagnostics,
}: ScriptDataLifecycleControlDependencies) {
  const getTestContext = getTestContextReader(testSurface);
  const context = () => getTestContext("scriptData");
  const lifecycle = createScriptDataLifecycle({
    getSettings: () => readContextValue(context(), "settings", getSettings()),
    getState: () => readContextValue(context(), "state", getState()),
    getGame: () => readContextValue(context(), "game", getGame()),
    getResources: () =>
      readContextValue(context(), "resources", getResources()),
    getBuildings: () =>
      readContextValue(context(), "buildings", getBuildings()),
    getWarManager: () =>
      readContextValue(context(), "WarManager", getWarManager()),
    getMarketManager: () =>
      readContextValue(context(), "MarketManager", getMarketManager()),
    getBuildingManager: () =>
      readContextValue(context(), "BuildingManager", getBuildingManager()),
    getSpyManager: () =>
      readContextValue(context(), "SpyManager", getSpyManager()),
    getEjectManager: () =>
      readContextValue(context(), "EjectManager", getEjectManager()),
    getSupplyManager: () =>
      readContextValue(context(), "SupplyManager", getSupplyManager()),
    getNaniteManager: () =>
      readContextValue(context(), "NaniteManager", getNaniteManager()),
    getRitualManager: () =>
      readContextValue(context(), "RitualManager", getRitualManager()),
    getUpdateCraftCost: () =>
      readContextAction(context(), "updateCraftCost", getUpdateCraftCost()),
    getResourcesPerClick: () =>
      readContextAction(
        context(),
        "getResourcesPerClick",
        getResourcesPerClick(),
      ),
    getTicksPerSecond: () =>
      readContextAction(context(), "ticksPerSecond", getTicksPerSecond()),
    getHaveTech: () => readContextAction(context(), "haveTech", getHaveTech()),
    diagnostics,
  });
  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      scriptDataLifecycle: lifecycle,
      setScriptDataTestContext(contextValue: unknown) {
        testSurface?.setContext("scriptData", contextValue);
      },
    });
  return lifecycle;
}
