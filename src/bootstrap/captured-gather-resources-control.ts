import { createCapturedGatherResourcesAdapter } from "../adapters/evolve/economy/resources/captured-gather-resources.ts";
import { runGatherResourcesAutomation } from "../application/gather-resources.ts";
import type { GameControlRegistry } from "../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../ports/game-root-state.ts";

export interface CapturedGatherResourcesControlDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
  readonly onSkipped?: (key: string, reason: string) => void;
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
