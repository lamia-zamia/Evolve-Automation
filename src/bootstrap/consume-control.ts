import {
  createConsumeCommandExecutor,
  createConsumeReader,
} from "../adapters/evolve/economy/resources/consume.ts";
import { runConsumeAutomation } from "../application/consume.ts";

// Composition seam for the consume slice: the runtime supplies the target
// eject/supply/nanite manager per call, so the reader/executor are constructed
// per invocation over that manager, matching the runtime's prior behavior.
export function createConsumeControl(dependencies: {
  getResources: () => unknown;
  isHungryRace: () => boolean;
}) {
  return Object.freeze({
    autoConsume: (manager: unknown) =>
      runConsumeAutomation({
        reader: createConsumeReader({
          getManager: () => manager,
          getResources: dependencies.getResources,
          isHungryRace: dependencies.isHungryRace,
        }),
        executor: createConsumeCommandExecutor(() => manager),
      }),
  });
}
