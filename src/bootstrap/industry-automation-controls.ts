import { createSmelterControl } from "./smelter-control.ts";
import { createResourceRatioControls } from "./resource-ratio-controls.ts";
import { createFactoryControl } from "./factory-control.ts";

declare global {
  var __EA_TEST_SURFACE_ENABLED__: boolean;
}

interface RuntimeTestSurface {
  add(part: Record<string, unknown>): void;
}

type ResourceRatioDependencies = Parameters<
  typeof createResourceRatioControls
>[0];
type SmelterDependencies = Parameters<typeof createSmelterControl>[0];
type FactoryDependencies = Parameters<typeof createFactoryControl>[0];

interface IndustryAutomationControlDependencies {
  readonly resourceRatio: ResourceRatioDependencies;
  readonly smelter: SmelterDependencies;
  readonly factory: FactoryDependencies;
  readonly getFactoryManager: () => unknown;
  readonly getFactorySettings: () => unknown;
  readonly getFactoryState: () => unknown;
  readonly testSurface: RuntimeTestSurface | undefined;
}

// Composition seam for the industry automation family. The individual
// controls retain their own typed ports while this seam owns their shared tick
// wiring and the factory characterization surface.
export function createIndustryAutomationControls({
  resourceRatio,
  smelter,
  factory,
  getFactoryManager,
  getFactorySettings,
  getFactoryState,
  testSurface,
}: IndustryAutomationControlDependencies) {
  const ratios = createResourceRatioControls(resourceRatio);
  const smelterControl = createSmelterControl(smelter);
  const factoryControl = createFactoryControl(factory);

  if (globalThis.__EA_TEST_SURFACE_ENABLED__)
    testSurface?.add({
      autoFactory: factoryControl.autoFactory,
      FactoryManager: getFactoryManager(),
      factorySettings: getFactorySettings(),
      factoryState: getFactoryState(),
    });

  return Object.freeze({
    ...ratios,
    ...smelterControl,
    ...factoryControl,
  });
}
