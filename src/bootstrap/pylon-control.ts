import {
  createPylonCommandExecutor,
  readPylonInput,
} from "../adapters/evolve/economy/production/pylon.ts";
import { planPylon } from "../domain/economy/production/pylon.ts";

// Composition seam for the pylon slice: owns the Evolve command executor and
// returns the control entry the runtime places at its tick position.
export function createPylonControl(
  dependencies: Parameters<typeof readPylonInput>[0],
) {
  const executor = createPylonCommandExecutor(dependencies.getRitualManager);
  return Object.freeze({
    autoPylon: () => executor.execute(planPylon(readPylonInput(dependencies))),
  });
}
