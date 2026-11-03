import { createCapturedGatherResourcesAdapter } from "../adapters/evolve/economy/resources/captured-gather-resources.ts";
import { runGatherResourcesAutomation } from "../application/gather-resources.ts";
import type { GameControlRegistry } from "../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../ports/game-root-state.ts";
import type { GatherMaterialTarget } from "../ports/gather-resources.ts";

export interface CapturedGatherResourcesControlDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly readMaterialTarget?: () => GatherMaterialTarget | undefined;
  readonly readRootGeneration?: () => number;
  readonly onSkipped?: (key: string, reason: string) => void;
  readonly readTestIntervention?: () => unknown;
}

export function createCapturedGatherResourcesControl(
  dependencies: CapturedGatherResourcesControlDependencies,
): () => void {
  const adapter = createCapturedGatherResourcesAdapter(dependencies);
  return () => {
    runGatherResourcesAutomation({
      reader: adapter.reader,
      executor: adapter.executor,
    });
  };
}
