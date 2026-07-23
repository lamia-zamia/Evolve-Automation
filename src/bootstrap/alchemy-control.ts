import {
  createAlchemyCommandExecutor,
  readAlchemyInput,
} from "../adapters/evolve/economy/production/alchemy.ts";
import { planAlchemy } from "../domain/economy/production/alchemy.ts";

// Composition seam for the alchemy slice: owns the Evolve command executor and
// returns the control entry the runtime places at its tick position. The
// executor is built once; the input is read and planned on each call, exactly as
// the runtime closure did.
export function createAlchemyControl(
  dependencies: Parameters<typeof readAlchemyInput>[0],
) {
  const executor = createAlchemyCommandExecutor(dependencies.getAlchemyManager);
  return Object.freeze({
    autoAlchemy: () =>
      executor.execute(planAlchemy(readAlchemyInput(dependencies))),
  });
}
